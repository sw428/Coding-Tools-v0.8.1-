param([Parameter(Mandatory=$true)][string]$Manifest, [Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Web.Extensions
Add-Type -ReferencedAssemblies System.Drawing,System.Web.Extensions -TypeDefinition @'
using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Collections;
using System.Collections.Generic;
using System.Web.Script.Serialization;
public static class CodingToolsGifRenderer {
 const int W=1120,H=700;
 static Color C(string hex){return ColorTranslator.FromHtml(hex);}
 static Dictionary<string,object> D(object v){return v as Dictionary<string,object> ?? new Dictionary<string,object>();}
 static object V(object v,string k,object fallback=null){object r; return D(v).TryGetValue(k,out r)?r:fallback;}
 static string S(object v,string k,string fallback=""){return Convert.ToString(V(v,k,fallback));}
 static int N(object v,string k,int fallback=0){return Convert.ToInt32(V(v,k,fallback));}
 static object[] A(object v,string k){var x=V(v,k);if(x is object[])return (object[])x;if(x is ArrayList)return ((ArrayList)x).ToArray();return new object[0];}
 static Font F(float size,bool mono=false,bool bold=false){return new Font(mono?"Consolas":"Meiryo UI",size,bold?FontStyle.Bold:FontStyle.Regular,GraphicsUnit.Pixel);}
 static void Box(Graphics g,int x,int y,int w,int h,string color){using(var b=new SolidBrush(C(color)))g.FillRectangle(b,x,y,w,h);}
 static void Border(Graphics g,int x,int y,int w,int h,string color){using(var p=new Pen(C(color)))g.DrawRectangle(p,x,y,w,h);}
 static void Txt(Graphics g,string text,int x,int y,int w,int h,float size,string color,bool mono=false,bool bold=false){using(var f=F(size,mono,bold))using(var b=new SolidBrush(C(color)))using(var format=(StringFormat)StringFormat.GenericTypographic.Clone()){format.FormatFlags=StringFormatFlags.NoWrap;format.Trimming=StringTrimming.EllipsisCharacter;g.DrawString(text,f,b,new RectangleF(x,y,w,h),format);}}
 static float Measure(Graphics g,string s,float size){using(var f=F(size,true))return g.MeasureString(s,f,10000,StringFormat.GenericTypographic).Width;}
 static void Pointer(Graphics g,int x,int y){Point[] points={new Point(x,y),new Point(x+2,y+23),new Point(x+8,y+17),new Point(x+15,y+26),new Point(x+19,y+23),new Point(x+12,y+14),new Point(x+22,y+13)};g.FillPolygon(Brushes.White,points);g.DrawPolygon(Pens.Black,points);}
 static void Code(Graphics g,object[] lines,int x,int y,int w,int h,object st,bool diff=false,bool marks=true){
  Box(g,x,y,w,h,"#1e1e1e"); int lineHeight=29;float font=19;
  for(int r=0;r<lines.Length;r++){
   int yy=y+14+r*lineHeight;if(yy+24>y+h)break;string text=Convert.ToString(lines[r]);
   if(diff&&text.StartsWith("+"))Box(g,x+40,yy-1,w-46,27,"#173c2b");
   if(diff&&text.StartsWith("-"))Box(g,x+40,yy-1,w-46,27,"#4c262b");
   if(marks && N(st,"activeRow",-1)==r)Box(g,x+40,yy-1,w-46,27,"#283d52");
   if(marks)foreach(var m in A(st,"marks")){if(N(m,"row")==r){int start=Math.Min(text.Length,N(m,"start"));int length=Math.Min(text.Length-start,N(m,"length"));int xx=x+52+(int)Measure(g,text.Substring(0,start),font);int ww=length>0?(int)Measure(g,text.Substring(start,length),font):3;Box(g,xx,yy-1,Math.Max(3,ww),26,"#245fa2");}}
   Txt(g,(r+1).ToString(),x+2,yy,32,24,16,"#858585",true);
   string color=text.StartsWith("+")&&diff?"#94e3b3":text.StartsWith("-")&&diff?"#f6a5ac":text.TrimStart().StartsWith("<")?"#b9daed":text.TrimStart().StartsWith(".")||text.TrimStart().StartsWith("@")?"#dfc789":"#d4d4d4";
   Txt(g,text,x+52,yy,w-62,26,font,color,true);
  }
  if(marks){var mm=A(st,"marks");if(mm.Length>0){var m=mm[mm.Length-1];int r=N(m,"row");if(r<lines.Length){string t=Convert.ToString(lines[r]);int start=Math.Min(t.Length,N(m,"start"));int xx=x+52+(int)Measure(g,t.Substring(0,start),font);Pointer(g,Math.Min(x+w-30,xx+16),y+30+r*lineHeight);}}}
 }
 static Bitmap Frame(object demo,object st,int index,int count){
  var bmp=new Bitmap(W,H);using(var g=Graphics.FromImage(bmp)){
   g.Clear(C("#eff3fa"));g.TextRenderingHint=TextRenderingHint.AntiAliasGridFit;
   Box(g,0,0,W,7,"#2367d1");Txt(g,S(demo,"id")+"  "+S(demo,"title"),24,22,1070,40,28,"#172d4e",false,true);
   string key=S(demo,"key");Txt(g,key,26,70,1050,28,18,"#285bad",false,true);
   Box(g,24,114,1072,453,"#181818");Box(g,24,114,1072,28,"#323233");
   Txt(g,"Coding Tools Demo - Visual Studio Code",38,118,700,24,13,"#c6c6c6");Txt(g,"操作イメージ",954,118,130,24,13,"#b8c2d0");
   Box(g,24,142,235,425,"#252526");Txt(g,"EXPLORER",38,156,200,22,14,"#b6b6b6");
   var sidebar=A(st,"sidebar");if(sidebar.Length==0)sidebar=new object[]{"CODING-TOOLS-DEMO","  index.html","  style.css","","Coding Tools 履歴","Coding Tools 設定"};
   for(int i=0;i<sidebar.Length;i++){int yy=191+i*30;if(yy>535)break;if(N(st,"sideFocus",-1)==i)Box(g,27,yy-2,230,27,"#24527c");Txt(g,Convert.ToString(sidebar[i]),37,yy,213,27,14,"#d0d0d0");}
   string mode=S(st,"mode");string tab=S(st,"tab","index.html");Box(g,259,142,837,36,"#2d2d2d");Txt(g,tab+"     ×",276,151,800,24,16,"#efefef");
   var lines=A(st,"lines");
   if(mode=="diff"){
    Box(g,260,178,416,28,"#292929");Box(g,678,178,417,28,"#292929");Txt(g,"変更前（元ファイル）",275,183,385,25,15,"#d1d7de");Txt(g,"変更後（追加予定）",693,183,385,25,15,"#9ee0b7");
    Code(g,A(st,"before"),260,206,416,360,st,false,false);Code(g,A(st,"after"),679,206,416,360,st,true,false);
    var before=A(st,"before");var after=A(st,"after");for(int i=0;i<after.Length;i++){string t=Convert.ToString(after[i]);if(i>=before.Length || Convert.ToString(before[i])!=t){int yy=220+i*29;if(yy<540){Box(g,680,yy-1,411,27,"#163c2b");Txt(g,"+",684,yy,18,25,18,"#a5e3b9",true);Txt(g,t,711,yy,376,25,18,"#b1e3bf",true);}}}
   }else if(mode=="settings" || mode=="folder"){
    Box(g,260,178,835,388,"#1e1e1e");for(int i=0;i<lines.Length;i++){int yy=192+i*31;if(yy+27>566)break;if(N(st,"activeRow",-1)==i)Box(g,272,yy-2,808,30,"#264f78");string t=Convert.ToString(lines[i]);Txt(g,t,285,yy,785,28,i==0?20:18,t.StartsWith("OFF")?"#eab56a":"#e0e0e0",false,i==0);if(N(st,"activeRow",-1)==i)Pointer(g,1040,yy+5);}
   }else Code(g,lines,260,178,835,388,st,mode=="patch");
   var info=A(st,"info");if(info.Length>0){int ih=36+info.Length*25;int iy=552-ih;Box(g,340,iy,704,ih,"#273649");Border(g,340,iy,704,ih,"#597ea9");for(int i=0;i<info.Length;i++)Txt(g,Convert.ToString(info[i]),356,iy+14+i*25,668,25,16,"#d3e5f8");}
   var menu=A(st,"menu");if(menu.Length>0){int mh=62+menu.Length*42;int my=Math.Max(188,348-mh/2);Box(g,326,my,720,mh,"#252a33");Border(g,326,my,720,mh,"#7d8faa");Txt(g,S(st,"menuTitle"),342,my+13,685,30,17,"#f0f3fa",false,true);for(int i=0;i<menu.Length;i++){int yy=my+53+i*42;bool focus=N(st,"focus")==i;if(focus)Box(g,337,yy-3,698,36,"#24527c");string text=Convert.ToString(menu[i]);if(V(st,"on")!=null)text=(N(st,"on")==i?"ON   ":"OFF  ")+text;Txt(g,text,350,yy+3,670,29,17,"#f0f0f0");if(focus)Pointer(g,997,yy+9);}}
   string toast=S(st,"toast");if(toast.Length>0){bool warning=Convert.ToBoolean(V(st,"warning",false));Box(g,326,502,744,49,warning?"#493a23":"#303f50");Border(g,326,502,744,49,warning?"#dbac54":"#6b8daf");Txt(g,toast,342,517,713,27,16,"#f4f6fb");}
   Box(g,24,567,1072,22,"#087bbd");Txt(g,"Coding Tools   |   "+S(demo,"category"),37,570,700,20,12,"#ffffff");Txt(g,(index+1)+" / "+count,1017,570,70,20,12,"#ffffff");
   Txt(g,S(st,"action"),26,610,1060,38,23,"#172d4e",false,true);
   Txt(g,"操作説明用の仮想画面です。実機録画ではありません。",27,665,1000,23,14,"#5d6b80");
   for(int i=0;i<count;i++)Box(g,26+i*33,594,26,4,i==index?"#2367d1":"#c9d4e4");
  }return bmp;
 }
 static Bitmap Indexed(Bitmap original){
  var rect=new Rectangle(0,0,original.Width,original.Height);var source=original.LockBits(rect,ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);var rgb=new byte[source.Stride*source.Height];Marshal.Copy(source.Scan0,rgb,0,rgb.Length);original.UnlockBits(source);
  var counts=new Dictionary<int,int>();for(int i=0;i<rgb.Length;i+=4){int c=rgb[i+2]<<16|rgb[i+1]<<8|rgb[i];int n;counts.TryGetValue(c,out n);counts[c]=n+1;}
  int[] colors=counts.OrderByDescending(p=>p.Value).Take(256).Select(p=>p.Key).ToArray();var result=new Bitmap(original.Width,original.Height,PixelFormat.Format8bppIndexed);var palette=result.Palette;for(int i=0;i<256;i++){int c=colors[Math.Min(i,colors.Length-1)];palette.Entries[i]=Color.FromArgb(255,(c>>16)&255,(c>>8)&255,c&255);}result.Palette=palette;
  var map=new Dictionary<int,byte>();for(int i=0;i<colors.Length;i++)map[colors[i]]=(byte)i;foreach(var c in counts.Keys){if(map.ContainsKey(c))continue;int best=0,score=int.MaxValue;int rr=(c>>16)&255,gg=(c>>8)&255,bb=c&255;for(int j=0;j<colors.Length;j++){int p=colors[j];int dr=rr-((p>>16)&255),dg=gg-((p>>8)&255),db=bb-(p&255);int s=dr*dr+dg*dg+db*db;if(s<score){score=s;best=j;}}map[c]=(byte)best;}
  var target=result.LockBits(rect,ImageLockMode.WriteOnly,PixelFormat.Format8bppIndexed);var data=new byte[target.Stride*target.Height];for(int y=0;y<original.Height;y++)for(int x=0;x<original.Width;x++){int at=y*source.Stride+x*4;int c=rgb[at+2]<<16|rgb[at+1]<<8|rgb[at];data[y*target.Stride+x]=map[c];}Marshal.Copy(data,0,target.Scan0,data.Length);result.UnlockBits(target);return result;
 }
 static void Subblocks(BinaryReader r){while(true){int size=r.ReadByte();if(size==0)break;r.ReadBytes(size);}}
 static void AddGifFrame(BinaryWriter output,Bitmap frame,int delay,bool first){
  byte[] data;using(var m=new MemoryStream()){using(var indexed=Indexed(frame))indexed.Save(m,ImageFormat.Gif);data=m.ToArray();}
  using(var r=new BinaryReader(new MemoryStream(data))){byte[] hdr=r.ReadBytes(13);int packed=hdr[10];int globalSize=(packed&128)!=0?3*(1<<((packed&7)+1)):0;byte[] global=r.ReadBytes(globalSize);
   if(first){output.Write(Encoding.ASCII.GetBytes("GIF89a"));output.Write(hdr,6,7);output.Write(global);output.Write(new byte[]{0x21,0xff,11});output.Write(Encoding.ASCII.GetBytes("NETSCAPE2.0"));output.Write(new byte[]{3,1,0,0,0});}
   while(r.BaseStream.Position<r.BaseStream.Length){int marker=r.ReadByte();if(marker==0x21){r.ReadByte();Subblocks(r);continue;}if(marker==0x3b)break;if(marker!=0x2c)throw new Exception("Unexpected GIF block");byte[] descriptor=r.ReadBytes(9);int lp=descriptor[8];byte[] palette=(lp&128)!=0?r.ReadBytes(3*(1<<((lp&7)+1))):global;int sizeBits=(lp&128)!=0?lp&7:packed&7;descriptor[8]=(byte)(0x80|sizeBits);long begin=r.BaseStream.Position;r.ReadByte();Subblocks(r);int length=(int)(r.BaseStream.Position-begin);output.Write(new byte[]{0x21,0xf9,4,4,(byte)(delay&255),(byte)(delay>>8),0,0});output.Write((byte)0x2c);output.Write(descriptor);output.Write(palette);output.Write(data,(int)begin,length);break;}
  }
 }
 public static void Build(string manifest,string directory){
  var serializer=new JavaScriptSerializer();serializer.MaxJsonLength=16777216;var source=serializer.DeserializeObject(File.ReadAllText(manifest,Encoding.UTF8));Directory.CreateDirectory(directory);int count=0;
  foreach(var demo in A(source,"demos")){var steps=A(demo,"steps");string filename=S(demo,"id")+"-"+S(demo,"slug")+".gif";using(var output=new BinaryWriter(File.Create(Path.Combine(directory,filename)))){for(int i=0;i<steps.Length;i++)using(var bitmap=Frame(demo,steps[i],i,steps.Length)){AddGifFrame(output,bitmap,i==steps.Length-1?300:230,i==0);if(i==0)bitmap.Save(Path.Combine(directory,S(demo,"id")+"-"+S(demo,"slug")+".png"),ImageFormat.Png);}output.Write((byte)0x3b);}count++;Console.WriteLine(filename);}
  Console.WriteLine("Generated "+count+" animated GIFs.");
 }
}
'@
[CodingToolsGifRenderer]::Build($Manifest, $OutputDirectory)
