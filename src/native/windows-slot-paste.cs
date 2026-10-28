// Windows-only, local hotkeys for the two Coding Tools slots.
// No keystroke logging, startup registration, network listener, or clipboard file.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace CodingTools {
  public sealed class SlotEntry { public int n; public string text; public long version; }
  public sealed class SlotPacket { public string type; public SlotEntry[] slots; }
  internal sealed class Request {
    internal int Slot; internal IntPtr Window; internal long At;
  }
  internal sealed class ClipboardCopy : IDisposable {
    internal readonly DataObject Data = new DataObject();
    internal readonly List<IDisposable> Resources = new List<IDisposable>();
    public void Dispose() { foreach (IDisposable r in Resources) r.Dispose(); Resources.Clear(); }
  }
  internal sealed class ObservedData : DataObject {
    internal long LastRead;
    internal ObservedData(DataObject value) {
      foreach (string format in value.GetFormats(false)) SetData(format, false, value.GetData(format, false));
    }
    private void Read(string format) {
      if (format == DataFormats.UnicodeText || format == DataFormats.Text || format == DataFormats.StringFormat)
        Interlocked.Exchange(ref LastRead, SlotHost.Clock.ElapsedMilliseconds + 1);
    }
    public override object GetData(string format, bool convert) { Read(format); return base.GetData(format, convert); }
    public override object GetData(string format) { Read(format); return base.GetData(format); }
    public override object GetData(Type type) { if (type == typeof(string)) Read(DataFormats.UnicodeText); return base.GetData(type); }
  }
  public sealed class SlotHost : Form {
    internal static readonly Stopwatch Clock = Stopwatch.StartNew();
    private const string OwnerFormat = "CodingTools.ExternalPaste.Owner";
    private const int WH_KEYBOARD_LL = 13;
    private readonly object gate = new object();
    private readonly string[] slots = new string[2];
    private readonly long[] versions = new long[] {-1, -1};
    private readonly List<StreamWriter> clients = new List<StreamWriter>();
    private readonly List<NamedPipeServerStream> pipes = new List<NamedPipeServerStream>();
    private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    private readonly string pipeName;
    private Native.HookProc hookProc;
    private IntPtr hook;
    private volatile bool running = true;
    private Request pending;
    private int swallowedKey;
    private long lastClient = 0;
    private int epoch = 0;
    private ClipboardCopy original;
    private ObservedData temporary;
    private string token;
    private long pasteStarted, lastRestoreError;
    private bool immediateRestore;

    private SlotHost(string name, bool probeIpc) {
      pipeName = name; ShowInTaskbar = false; FormBorderStyle = FormBorderStyle.None;
      CreateHandle();
      hookProc = Keyboard;
      if (!probeIpc) {
        hook = Native.SetWindowsHookEx(WH_KEYBOARD_LL, hookProc, Native.GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero) throw new InvalidOperationException("hotkey hook unavailable");
      }
      timer.Interval = 25; timer.Tick += Tick; timer.Start();
      new Thread(Accept) { IsBackground = true }.Start();
    }
    protected override void SetVisibleCore(bool value) { base.SetVisibleCore(false); }
    private static bool Down(int key) { return (Native.GetAsyncKeyState(key) & 0x8000) != 0; }
    private static bool IsCode(IntPtr window) {
      uint pid; Native.GetWindowThreadProcessId(window, out pid);
      try {
        string name = Process.GetProcessById((int)pid).ProcessName;
        return name.Equals("Code", StringComparison.OrdinalIgnoreCase) ||
          name.Equals("Code - Insiders", StringComparison.OrdinalIgnoreCase) ||
          name.Equals("VSCodium", StringComparison.OrdinalIgnoreCase);
      } catch { return true; } // Do not consume keys for an unidentified process.
    }
    internal static bool Chord(uint key, bool ctrl, bool alt, bool shift, bool win, bool altGr, bool injected) {
      return (key == 0x31 || key == 0x32) && ctrl && alt && !shift && !win && !altGr && !injected;
    }
    private IntPtr Keyboard(int code, IntPtr message, IntPtr pointer) {
      if (code < 0) return Native.CallNextHookEx(hook, code, message, pointer);
      Native.KeyInfo info = (Native.KeyInfo)Marshal.PtrToStructure(pointer, typeof(Native.KeyInfo));
      bool injected = (info.flags & 0x10) != 0;
      int msg = message.ToInt32();
      if (!injected && swallowedKey == (int)info.vkCode && (msg == 0x101 || msg == 0x105)) {
        swallowedKey = 0; return new IntPtr(1);
      }
      if (!injected && swallowedKey == (int)info.vkCode && (msg == 0x100 || msg == 0x104)) return new IntPtr(1);
      if ((msg == 0x100 || msg == 0x104) &&
          Chord(info.vkCode, Down(0x11), Down(0x12), Down(0x10), Down(0x5B) || Down(0x5C), Down(0xA5), injected)) {
        IntPtr window = Native.GetForegroundWindow();
        int slot = (int)info.vkCode - 0x31;
        bool available; lock (gate) available = clients.Count > 0 && !String.IsNullOrEmpty(slots[slot]);
        if (available && window != IntPtr.Zero && !IsCode(window)) {
          if (swallowedKey == 0) pending = new Request {Slot = slot, Window = window, At = Clock.ElapsedMilliseconds};
          swallowedKey = (int)info.vkCode;
          return new IntPtr(1);
        }
      }
      return Native.CallNextHookEx(hook, code, message, pointer);
    }
    private void Accept() {
      PipeSecurity security = new PipeSecurity();
      security.SetAccessRuleProtection(true, false);
      security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
      while (running) {
        NamedPipeServerStream server = null;
        try {
          server = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 32, PipeTransmissionMode.Byte,
            PipeOptions.None, 4096, 4096, security);
          lock (gate) pipes.Add(server);
          server.WaitForConnection();
          if (!running) { server.Dispose(); break; }
          NamedPipeServerStream connected = server;
          new Thread(delegate() { Serve(connected); }) {IsBackground = true}.Start();
        } catch { if (server != null) server.Dispose(); if (!running) break; Thread.Sleep(100); }
      }
    }
    private void Serve(NamedPipeServerStream pipe) {
      StreamWriter writer = null;
      int clientEpoch;
      try {
        writer = new StreamWriter(pipe, new UTF8Encoding(false)); writer.AutoFlush = true;
        lock (gate) {clients.Add(writer); clientEpoch = epoch; lastClient = Clock.ElapsedMilliseconds;}
        StreamReader reader = new StreamReader(pipe, Encoding.UTF8);
        JavaScriptSerializer json = new JavaScriptSerializer(); json.MaxJsonLength = 8 * 1024 * 1024;
        string line;
        while (running && (line = reader.ReadLine()) != null) {
          if (line.Length > 8 * 1024 * 1024) break;
          SlotPacket packet = json.Deserialize<SlotPacket>(line);
          if (packet.type == "disable") {
            lock (gate) {
              epoch++; slots[0] = slots[1] = null;
              foreach (StreamWriter client in clients) try {client.WriteLine("{\"type\":\"disabled\"}");} catch {}
            }
            break;
          }
          if (packet.type != "slots" || packet.slots == null) continue;
          lock (gate) {
            if (clientEpoch != epoch) continue;
            foreach (SlotEntry item in packet.slots) {
            if (item.n < 1 || item.n > 2 || item.version < versions[item.n - 1] ||
                (item.text != null && item.text.Length > 1024 * 1024)) continue;
            slots[item.n - 1] = item.text; versions[item.n - 1] = item.version;
            }
          }
        }
      } catch {} finally {
        lock (gate) { if (writer != null) clients.Remove(writer); pipes.Remove(pipe); lastClient = Clock.ElapsedMilliseconds; }
        pipe.Dispose();
      }
    }
    private void ReportError() {
      lock (gate) foreach (StreamWriter client in clients)
        try {client.WriteLine("{\"type\":\"error\"}");} catch {}
    }
    private static object CloneValue(object value, ClipboardCopy copy) {
      if (value == null) throw new InvalidOperationException("unavailable clipboard format");
      if (value is string || value.GetType().IsPrimitive || value is decimal) return value;
      if (value is string[]) return ((string[])value).Clone();
      if (value is byte[]) return ((byte[])value).Clone();
      Image image = value as Image;
      if (image != null) {Image clone = (Image)image.Clone(); copy.Resources.Add(clone); return clone;}
      Stream stream = value as Stream;
      if (stream != null) {
        long old = stream.CanSeek ? stream.Position : 0;
        MemoryStream clone = new MemoryStream();
        try {
          if (!stream.CanSeek || stream.Length > 64 * 1024 * 1024) throw new InvalidOperationException("unsupported clipboard stream");
          stream.Position = 0; stream.CopyTo(clone); clone.Position = 0;
        } finally {if (stream.CanSeek) stream.Position = old;}
        copy.Resources.Add(clone); return clone;
      }
      System.Collections.Specialized.StringCollection files = value as System.Collections.Specialized.StringCollection;
      if (files != null) {var clone = new System.Collections.Specialized.StringCollection(); foreach(string file in files) clone.Add(file); return clone;}
      // Refuse to paste if any existing format cannot be preserved faithfully.
      throw new InvalidOperationException("unsupported clipboard format");
    }
    private static ClipboardCopy CaptureClipboard(IDataObject data) {
      ClipboardCopy copy = new ClipboardCopy();
      try {
        if (data != null) foreach (string format in data.GetFormats(false))
          copy.Data.SetData(format, false, CloneValue(data.GetData(format, false), copy));
        return copy;
      } catch {copy.Dispose(); throw;}
    }
    private static DataObject Temporary(string text, string id) {
      DataObject data = new DataObject();
      data.SetText(text, TextDataFormat.UnicodeText);
      data.SetData(OwnerFormat, false, id);
      data.SetData("ExcludeClipboardContentFromMonitorProcessing", false, new MemoryStream(new byte[] {0}));
      data.SetData("CanIncludeInClipboardHistory", false, new MemoryStream(new byte[4]));
      data.SetData("CanUploadToCloudClipboard", false, new MemoryStream(new byte[4]));
      return data;
    }
    private bool OwnsClipboard() {
      IDataObject data = Clipboard.GetDataObject();
      return data != null && data.GetDataPresent(OwnerFormat, false) && Object.Equals(data.GetData(OwnerFormat, false), token);
    }
    private void Finish() {
      if (original != null) original.Dispose();
      original = null; temporary = null; token = null; immediateRestore = false;
    }
    private void Restore() {
      try {
        // A newer ordinary copy has no ownership marker: never overwrite it.
        if (!OwnsClipboard()) {Finish(); return;}
        Clipboard.SetDataObject(original.Data, true, 5, 20);
        Finish();
      } catch {
        if (Clock.ElapsedMilliseconds - lastRestoreError > 5000) {lastRestoreError = Clock.ElapsedMilliseconds; ReportError();}
      }
    }
    private void Tick(object sender, EventArgs args) {
      if (original != null) {
        long now = Clock.ElapsedMilliseconds;
        long read = Interlocked.Read(ref temporary.LastRead);
        if (immediateRestore || now - pasteStarted >= 2500 ||
            (now - pasteStarted >= 350 && read > 0 && now - read >= 150)) Restore();
        return;
      }
      int count; lock (gate) count = clients.Count;
      if (count == 0 && Clock.ElapsedMilliseconds - lastClient > 6000) {Close(); return;}
      if (pending == null) return;
      if (Native.GetForegroundWindow() != pending.Window || Clock.ElapsedMilliseconds - pending.At > 2000) {pending = null; return;}
      if (Down(0x11) || Down(0x12) || Down(0x10) || Down(0x5B) || Down(0x5C) || swallowedKey != 0) return;
      Request request = pending; pending = null;
      string text; lock (gate) text = slots[request.Slot];
      if (String.IsNullOrEmpty(text)) return;
      try {
        ClipboardCopy saved = null;
        for (int attempt = 0; attempt < 2; attempt++) {
          uint sequence = Native.GetClipboardSequenceNumber();
          saved = CaptureClipboard(Clipboard.GetDataObject());
          if (Native.GetClipboardSequenceNumber() == sequence) break;
          saved.Dispose(); saved = null;
        }
        if (saved == null) return;
        // Delayed rendering may change the sequence: retry once before aborting.
        if (Native.GetForegroundWindow() != request.Window) {saved.Dispose(); return;}
        original = saved; token = Guid.NewGuid().ToString("N");
        temporary = new ObservedData(Temporary(text, token));
        pasteStarted = Clock.ElapsedMilliseconds;
        Clipboard.SetDataObject(temporary, false, 5, 20);
        if (Native.GetForegroundWindow() != request.Window || Down(0x11) || Down(0x12) || Down(0x10) || Down(0x5B) || Down(0x5C)) {immediateRestore = true; return;}
        Native.Input[] inputs = Native.PasteKeys();
        uint sent = Native.SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Native.Input)));
        if (sent != inputs.Length) {
          if (sent > 0) Native.SendInput(2, new Native.Input[] {Native.Key(0x56, true), Native.Key(0x11, true)}, Marshal.SizeOf(typeof(Native.Input)));
          immediateRestore = true; ReportError();
        }
      } catch {if (original != null) immediateRestore = true; ReportError();}
    }
    protected override void OnFormClosed(FormClosedEventArgs e) {
      running = false; timer.Stop();
      if (hook != IntPtr.Zero) Native.UnhookWindowsHookEx(hook);
      lock (gate) foreach (NamedPipeServerStream pipe in pipes) try {pipe.Dispose();} catch {}
      base.OnFormClosed(e);
    }
    public static void Run(string pipeName, bool probeIpc) {
      bool created;
      using (Mutex singleton = new Mutex(true, "Local\\" + pipeName, out created)) {
        if (!created) return;
        Application.Run(new SlotHost(pipeName, probeIpc));
      }
    }
    public static void SelfTest() {
      Native.HookProc passthrough = delegate(int n, IntPtr w, IntPtr l) {return Native.CallNextHookEx(IntPtr.Zero, n, w, l);};
      IntPtr testHook = Native.SetWindowsHookEx(WH_KEYBOARD_LL, passthrough, Native.GetModuleHandle(null), 0);
      if (testHook == IntPtr.Zero) throw new Exception("hook installation");
      Native.UnhookWindowsHookEx(testHook); GC.KeepAlive(passthrough);
      if (!Chord(0x31, true, true, false, false, false, false) ||
          Chord(0x32, true, true, false, false, true, false) ||
          Chord(0x31, true, true, false, false, false, true) ||
          Chord(0x31, true, true, true, false, false, false))
        throw new Exception("chord filtering");
      int expected = IntPtr.Size == 8 ? 40 : 28;
      if (Marshal.SizeOf(typeof(Native.Input)) != expected) throw new Exception("INPUT layout");
      DataObject sample = new DataObject();
      sample.SetText("Coding Tools 日本語", TextDataFormat.UnicodeText);
      sample.SetData(DataFormats.Html, false, "<b>sample</b>");
      sample.SetData("CodingTools.Test.Bytes", false, new MemoryStream(new byte[] {1, 2, 3}));
      using (ClipboardCopy clone = CaptureClipboard(sample)) {
        if (!Object.Equals(clone.Data.GetData(DataFormats.UnicodeText), "Coding Tools 日本語")) throw new Exception("text snapshot");
        if (!Object.Equals(clone.Data.GetData(DataFormats.Html), "<b>sample</b>")) throw new Exception("rich text snapshot");
      }
      bool refused = false;
      try {using (ClipboardCopy copy = new ClipboardCopy()) CloneValue(new object(), copy);} catch {refused = true;}
      if (!refused) throw new Exception("unknown format not refused");
      // Exercise the real Windows clipboard and a private, unfocused text box.
      // No keys are sent to another app during this test.
      using (ClipboardCopy before = CaptureClipboard(Clipboard.GetDataObject())) {
        string id = Guid.NewGuid().ToString("N");
        ObservedData data = new ObservedData(Temporary("ct_external_probe", id));
        bool owns = false;
        try {
          Clipboard.SetDataObject(data, false, 5, 20); owns = true;
          using (TextBox input = new TextBox()) {
            input.CreateControl(); input.Paste();
            if (input.Text != "ct_external_probe") throw new Exception("native input paste");
          }
          if (Interlocked.Read(ref data.LastRead) == 0) throw new Exception("clipboard read observation");
          IDataObject current = Clipboard.GetDataObject();
          if (current == null || !Object.Equals(current.GetData(OwnerFormat, false), id)) throw new Exception("clipboard changed concurrently");
          Clipboard.SetDataObject(before.Data, true, 5, 20); owns = false;
        } finally {
          if (owns) {
            IDataObject current = Clipboard.GetDataObject();
            if (current != null && Object.Equals(current.GetData(OwnerFormat, false), id))
              Clipboard.SetDataObject(before.Data, true, 5, 20);
          }
        }
      }
      Console.WriteLine("NATIVE_SELF_TESTS_PASSED");
    }
  }
  internal static class Native {
    internal delegate IntPtr HookProc(int n, IntPtr w, IntPtr l);
    [StructLayout(LayoutKind.Sequential)] internal struct KeyInfo {internal uint vkCode, scanCode, flags, time; internal UIntPtr extra;}
    [StructLayout(LayoutKind.Sequential)] internal struct Input {internal uint type; internal InputUnion data;}
    [StructLayout(LayoutKind.Explicit)] internal struct InputUnion {
      [FieldOffset(0)] internal KeyboardInput keyboard;
      [FieldOffset(0)] internal MouseInput mouse;
    }
    [StructLayout(LayoutKind.Sequential)] internal struct KeyboardInput {internal ushort key, scan; internal uint flags, time; internal UIntPtr extra;}
    [StructLayout(LayoutKind.Sequential)] internal struct MouseInput {internal int x, y; internal uint data, flags, time; internal UIntPtr extra;}
    internal static Input Key(ushort key, bool up) {
      Input value = new Input(); value.type = 1; value.data.keyboard.key = key; value.data.keyboard.flags = up ? 2u : 0u; return value;
    }
    internal static Input[] PasteKeys() {return new Input[] {Key(0x11, false), Key(0x56, false), Key(0x56, true), Key(0x11, true)};}
    [DllImport("user32.dll", SetLastError=true)] internal static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint thread);
    [DllImport("user32.dll")] internal static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] internal static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr w, IntPtr l);
    [DllImport("kernel32.dll", CharSet=CharSet.Auto)] internal static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] internal static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] internal static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll", SetLastError=true)] internal static extern uint SendInput(uint count, Input[] values, int size);
  }
}
