"""Check VSIX rotation without touching real distribution files."""
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile
import ast
import json
import re
import subprocess
import sys

project = Path(__file__).resolve().parents[1]
cache = project / '.cache'
cache.mkdir(exist_ok=True)
builder = (project / 'tools' / 'build-vsix.py').read_text(encoding='utf-8')
required = ast.literal_eval(re.search(r'for name in (\[[^\]]+\]):', builder).group(1))
metadata = json.loads((project / 'package.json').read_text(encoding='utf-8'))
with TemporaryDirectory(prefix='vsix-test-', dir=cache) as directory:
    root = Path(directory)
    assert root.resolve().is_relative_to(cache.resolve())
    (root / 'tools').mkdir()
    (root / 'tools' / 'build-vsix.py').write_text(builder, encoding='utf-8')
    for name in required:
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_text('fixture: ' + name, encoding='utf-8')
    (root / 'src' / 'native').mkdir(parents=True)
    for name in ['windows-slot-paste.cs', 'windows-slot-paste.ps1']:
        (root / 'src' / 'native' / name).write_text('native fixture: ' + name, encoding='utf-8')
    (root / 'package.json').write_text(json.dumps(metadata), encoding='utf-8')
    (root / metadata['icon']).parent.mkdir(parents=True, exist_ok=True)
    (root / metadata['icon']).write_bytes(b'fixture icon')
    (root / 'dist').mkdir()
    (root / 'dist' / 'old.vsix').write_bytes(b'previous package')
    def build(ok=True):
        result = subprocess.run([sys.executable, str(root / 'tools' / 'build-vsix.py')], capture_output=True)
        assert (result.returncode == 0) == ok, result.stderr.decode(errors='replace')
    build()
    latest = root / 'dist' / '配布用' / 'coding-tools-latest.vsix'
    past = root / 'dist' / '過去版'
    assert latest.is_file()
    assert not list((root / 'dist').glob('*.vsix'))
    assert [file.read_bytes() for file in past.glob('*.vsix')] == [b'previous package']
    with ZipFile(latest) as package:
        assert json.loads(package.read('extension/package.json')) == metadata
        assert package.read('extension/src/extension.js') == b'fixture: src/extension.js'
        assert package.read('extension/src/native/windows-slot-paste.cs') == b'native fixture: windows-slot-paste.cs'
        assert package.read('extension/src/native/windows-slot-paste.ps1') == b'native fixture: windows-slot-paste.ps1'
    previous_latest = latest.read_bytes()
    milestone = past / 'milestone.vsix'
    milestone.write_bytes(b'keep this milestone')
    (root / 'src' / 'extension.js').write_text('changed implementation', encoding='utf-8')
    build()
    assert previous_latest in [file.read_bytes() for file in past.glob('*.vsix')]
    assert milestone.read_bytes() == b'keep this milestone'
    assert len(list(past.glob('*.vsix'))) == 3
    before_failure = latest.read_bytes()
    archive_before = {file.name: file.read_bytes() for file in past.glob('*.vsix')}
    (root / 'src' / 'extension.js').unlink()
    build(ok=False)
    assert latest.read_bytes() == before_failure
    assert {file.name: file.read_bytes() for file in past.glob('*.vsix')} == archive_before
    assert not list((root / 'dist').glob('.coding-tools-*.tmp'))
print('build-vsix-tests: migration, previous version backup, milestone preservation, failure recovery passed')
