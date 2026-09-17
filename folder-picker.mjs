import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export async function pickFolder({ destination = false } = {}) {
  const script = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class FandockerFolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")] class FileOpenDialog {}
  [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr owner);
    void SetFileTypes(); void SetFileTypeIndex(); void GetFileTypeIndex(); void Advise(); void Unadvise();
    void SetOptions(uint options); void GetOptions(out uint options);
    void SetDefaultFolder(); void SetFolder(); void GetFolder(); void GetCurrentSelection();
    void SetFileName(); void GetFileName();
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel(); void SetFileNameLabel();
    void GetResult(out IShellItem item);
    void AddPlace(); void SetDefaultExtension(); void Close(); void SetClientGuid(); void ClearClientData(); void SetFilter();
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(); void GetParent();
    void GetDisplayName(uint kind, out IntPtr value);
    void GetAttributes(); void Compare();
  }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  public static string Pick(string title) {
    var dialog=(IFileDialog)new FileOpenDialog();
    try {
      uint options; dialog.GetOptions(out options);
      dialog.SetOptions(options | 0x20u | 0x40u | 0x800u | 0x02000000u);
      dialog.SetTitle(title);
      int result=dialog.Show(GetForegroundWindow());
      if(result==unchecked((int)0x800704C7)) return null;
      Marshal.ThrowExceptionForHR(result);
      IShellItem item; dialog.GetResult(out item);
      try {
        IntPtr value; item.GetDisplayName(0x80058000u,out value);
        try {return Marshal.PtrToStringUni(value);} finally {Marshal.FreeCoTaskMem(value);}
      } finally {Marshal.ReleaseComObject(item);}
    } finally {Marshal.ReleaseComObject(dialog);}
  }
}
"@
$selected = [FandockerFolderPicker]::Pick('${destination ? '整理先フォルダーを選択' : '画像フォルダーを選択'}')
if ($selected) { [Console]::Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($selected))) }`;
  const { stdout } = await run('powershell.exe', ['-NoProfile','-STA','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], {windowsHide:true,maxBuffer:65536});
  return stdout.trim() ? Buffer.from(stdout.trim(),'base64').toString('utf8') : null;
}
