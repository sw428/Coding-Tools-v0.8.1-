#!/usr/bin/env python3
"""Build a dependency-free VS Code VSIX extension package."""
from pathlib import Path
import json
from zipfile import ZipFile, ZIP_DEFLATED
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

root = Path(__file__).resolve().parent
metadata = json.loads((root / 'package.json').read_text(encoding='utf-8'))
dest = root / 'dist' / f"{metadata['name']}-{metadata['version']}.vsix"
dest.parent.mkdir(parents=True, exist_ok=True)
manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Id="{metadata['name']}" Version="{metadata['version']}" Language="ja-JP" Publisher="{metadata['publisher']}" />
    <DisplayName>{escape(metadata['displayName'])}</DisplayName>
    <Description xml:space="preserve">{escape(metadata['description'])}</Description>
    <Icon>extension/{escape(metadata['icon'])}</Icon>
    <Tags>copy,paste,css,macro</Tags>
    <Categories>Other</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="{metadata['engines']['vscode']}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/{metadata['icon']}" Addressable="true" />
  </Assets>
</PackageManifest>'''
content_types = '''<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="txt" ContentType="text/plain" />
  <Default Extension="svg" ContentType="image/svg+xml" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="gif" ContentType="image/gif" />
  <Default Extension="html" ContentType="text/html" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
  <Override PartName="/extension/LICENSE" ContentType="text/plain" />
</Types>'''
ET.fromstring(manifest)
ET.fromstring(content_types)
with ZipFile(dest, 'w', compression=ZIP_DEFLATED) as archive:
    archive.writestr('extension.vsixmanifest', manifest)
    archive.writestr('[Content_Types].xml', content_types)
    for name in ['package.json', 'extension.js', 'selectors.js', 'cross-navigation.js', 'placement.js', 'safe-placement.js', 'safe-preview.js', 'confirmation.js', 'history.js', 'history-view.js', 'settings.js', 'save-history.js', 'git-push-history.js', 'README.md', 'LICENSE']:
        archive.write(root / name, f'extension/{name}')
    archive.write(root / metadata['icon'], f"extension/{metadata['icon']}")
    for runtime in sorted((root / 'vendor' / 'postcss').rglob('*')):
        if runtime.is_file():
            archive.write(runtime, f'extension/{runtime.relative_to(root)}')
    for guide_file in sorted((root / 'docs').glob('*')):
        if guide_file.is_file():
            archive.write(guide_file, f'extension/docs/{guide_file.name}')
    for media_file in sorted((root / 'docs' / 'media' / 'gif').rglob('*')):
        if media_file.is_file() and media_file.suffix in {'.gif', '.png', '.html'}:
            archive.write(media_file, f'extension/{media_file.relative_to(root).as_posix()}')
with ZipFile(dest) as archive:
    assert archive.testzip() is None
    ET.fromstring(archive.read('extension.vsixmanifest'))
    ET.fromstring(archive.read('[Content_Types].xml'))
    assert json.loads(archive.read('extension/package.json')) == metadata
print(dest)
