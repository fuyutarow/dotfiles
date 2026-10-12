// Windows-only ConPTY bridge for the WSL Codex runtime.
// Build with the inbox .NET Framework compiler and System.Web.Extensions.dll.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

internal static class WindowsConPty
{
    private const int MaxConfigBase64Chars = 24 * 1024;
    private const int MaxFrameBytes = 1024 * 1024;
    private const int MaxInputBytes = 64 * 1024;
    private const uint ExtendedStartupInfoPresent = 0x00080000;
    private const uint CreateSuspended = 0x00000004;
    private const int StartfUseStdHandles = 0x00000100;
    private const int ProcThreadAttributePseudoConsole = 0x00020016;
    private const uint JobObjectExtendedLimitInformation = 9;
    private const uint JobObjectLimitKillOnJobClose = 0x00002000;
    private const uint WaitObject0 = 0;
    private const uint Infinite = 0xffffffff;
    private const int ExitForcedTermination = 143;

    private static readonly object InputLock = new object();
    private static IntPtr _ptyInput = IntPtr.Zero;
    private static IntPtr _pseudoConsole = IntPtr.Zero;
    private static IntPtr _job = IntPtr.Zero;
    private static int _terminated;
    private static int _childExited;

    private sealed class LaunchConfig
    {
        internal string Executable;
        internal string[] Args;
        internal string Cwd;
        internal string CodeXHome;
        internal short Cols;
        internal short Rows;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Coord { internal short X; internal short Y; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        internal int cb;
        internal string lpReserved;
        internal string lpDesktop;
        internal string lpTitle;
        internal int dwX;
        internal int dwY;
        internal int dwXSize;
        internal int dwYSize;
        internal int dwXCountChars;
        internal int dwYCountChars;
        internal int dwFillAttribute;
        internal int dwFlags;
        internal short wShowWindow;
        internal short cbReserved2;
        internal IntPtr lpReserved2;
        internal IntPtr hStdInput;
        internal IntPtr hStdOutput;
        internal IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct StartupInfoEx
    {
        internal StartupInfo StartupInfo;
        internal IntPtr lpAttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation
    {
        internal IntPtr hProcess;
        internal IntPtr hThread;
        internal int dwProcessId;
        internal int dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes
    {
        internal int nLength;
        internal IntPtr lpSecurityDescriptor;
        [MarshalAs(UnmanagedType.Bool)] internal bool bInheritHandle;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
        internal ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
        internal ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimitInformation
    {
        internal long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        internal uint LimitFlags;
        internal UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        internal uint ActiveProcessLimit;
        internal UIntPtr Affinity;
        internal uint PriorityClass, SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimitInformation
    {
        internal BasicLimitInformation BasicLimitInformation;
        internal IoCounters IoInfo;
        internal UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreatePipe(out IntPtr readPipe, out IntPtr writePipe, IntPtr attributes, int size);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern int CreatePseudoConsole(Coord size, IntPtr inputRead, IntPtr outputWrite, uint flags, out IntPtr pseudoConsole);
    [DllImport("kernel32.dll")]
    private static extern void ClosePseudoConsole(IntPtr pseudoConsole);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern int ResizePseudoConsole(IntPtr pseudoConsole, Coord size);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returnSize);
    [DllImport("kernel32.dll")]
    private static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateProcessW(string applicationName, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string currentDirectory, ref StartupInfoEx startupInfo, out ProcessInformation processInformation);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ReadFile(IntPtr handle, byte[] buffer, int bytesToRead, out int bytesRead, IntPtr overlapped);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WriteFile(IntPtr handle, byte[] buffer, int bytesToWrite, out int bytesWritten, IntPtr overlapped);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetInformationJobObject(IntPtr job, uint informationClass, ref ExtendedLimitInformation information, int length);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    private static int Main(string[] argv)
    {
        IntPtr ptyOutput = IntPtr.Zero;
        IntPtr childProcess = IntPtr.Zero;
        IntPtr childThread = IntPtr.Zero;
        IntPtr attributeList = IntPtr.Zero;
        Thread outputThread = null;
        bool jobAssigned = false;
        bool attributeListInitialized = false;
        try
        {
            LaunchConfig config = ParseConfig(argv);
            Environment.SetEnvironmentVariable("CODEX_HOME", config.CodeXHome, EnvironmentVariableTarget.Process);

            IntPtr ptyInputRead;
            IntPtr ptyOutputWrite;
            Check(CreatePipe(out ptyInputRead, out _ptyInput, IntPtr.Zero, 0), "CreatePipe(input)");
            Check(CreatePipe(out ptyOutput, out ptyOutputWrite, IntPtr.Zero, 0), "CreatePipe(output)");
            Check(SetHandleInformation(_ptyInput, 1, 0), "SetHandleInformation(input)");
            Check(SetHandleInformation(ptyOutput, 1, 0), "SetHandleInformation(output)");

            int hr = CreatePseudoConsole(new Coord { X = config.Cols, Y = config.Rows }, ptyInputRead, ptyOutputWrite, 0, out _pseudoConsole);
            if (hr < 0) throw new InvalidOperationException("CreatePseudoConsole failed: 0x" + hr.ToString("X8"));

            IntPtr attributeBytes = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeBytes);
            attributeList = Marshal.AllocHGlobal(attributeBytes);
            Check(InitializeProcThreadAttributeList(attributeList, 1, 0, ref attributeBytes), "InitializeProcThreadAttributeList");
            attributeListInitialized = true;
            Check(UpdateProcThreadAttribute(attributeList, 0, new IntPtr(ProcThreadAttributePseudoConsole), _pseudoConsole, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero), "UpdateProcThreadAttribute(PSEUDOCONSOLE)");

            StartupInfoEx startup = new StartupInfoEx();
            startup.StartupInfo.cb = Marshal.SizeOf(typeof(StartupInfoEx));
            // A redirected Windows parent otherwise causes CreateProcess to
            // duplicate its non-console standard handles into the child. With
            // the ConPTY attribute, explicit null standard handles select the
            // pseudoconsole's console handles instead.
            startup.StartupInfo.dwFlags = StartfUseStdHandles;
            startup.StartupInfo.hStdInput = IntPtr.Zero;
            startup.StartupInfo.hStdOutput = IntPtr.Zero;
            startup.StartupInfo.hStdError = IntPtr.Zero;
            startup.lpAttributeList = attributeList;
            ProcessInformation process;
            StringBuilder commandLine = new StringBuilder(BuildCommandLine(config.Executable, config.Args));
            Check(CreateProcessW(config.Executable, commandLine, IntPtr.Zero, IntPtr.Zero, false, ExtendedStartupInfoPresent | CreateSuspended, IntPtr.Zero, config.Cwd, ref startup, out process), "CreateProcessW");
            childProcess = process.hProcess;
            childThread = process.hThread;

            // The ConPTY owns these ends after process creation; retaining them prevents EOF.
            CloseHandle(ptyInputRead); ptyInputRead = IntPtr.Zero;
            CloseHandle(ptyOutputWrite); ptyOutputWrite = IntPtr.Zero;

            _job = CreateKillOnCloseJob();
            Check(AssignProcessToJobObject(_job, childProcess), "AssignProcessToJobObject");
            jobAssigned = true;
            if (ResumeThread(childThread) == 0xffffffff) throw LastError("ResumeThread");
            CloseHandle(childThread); childThread = IntPtr.Zero;

            outputThread = new Thread(new ThreadStart(delegate { PumpOutput(ptyOutput); }));
            outputThread.IsBackground = true;
            outputThread.Start();
            Thread controlThread = new Thread(new ThreadStart(delegate { ControlLoop(); }));
            controlThread.IsBackground = true;
            controlThread.Start();

            if (WaitForSingleObject(childProcess, Infinite) != WaitObject0) throw new InvalidOperationException("WaitForSingleObject failed");
            Interlocked.Exchange(ref _childExited, 1);
            ClosePtyInput();
            ClosePseudoConsoleAndDrain(outputThread);
            uint childExit;
            Check(GetExitCodeProcess(childProcess, out childExit), "GetExitCodeProcess");
            return Interlocked.CompareExchange(ref _terminated, 0, 0) != 0 ? ExitForcedTermination : unchecked((int)childExit);
        }
        catch (Exception error)
        {
            Diagnostic(error.Message);
            return 1;
        }
        finally
        {
            CloseJob();
            if (!jobAssigned && childProcess != IntPtr.Zero) TerminateProcess(childProcess, ExitForcedTermination);
            ClosePtyInput();
            if (_pseudoConsole != IntPtr.Zero) { ClosePseudoConsole(_pseudoConsole); _pseudoConsole = IntPtr.Zero; }
            if (ptyOutput != IntPtr.Zero) CloseHandle(ptyOutput);
            if (childProcess != IntPtr.Zero) CloseHandle(childProcess);
            if (childThread != IntPtr.Zero) CloseHandle(childThread);
            if (attributeList != IntPtr.Zero) { if (attributeListInitialized) DeleteProcThreadAttributeList(attributeList); Marshal.FreeHGlobal(attributeList); }
        }
    }

    private static LaunchConfig ParseConfig(string[] argv)
    {
        if (argv.Length != 1) throw new ArgumentException("expected exactly one base64 UTF-8 JSON launch config");
        if (argv[0].Length > MaxConfigBase64Chars) throw new ArgumentException("launch config Base64 exceeds 24 KiB");
        byte[] raw;
        try { raw = Convert.FromBase64String(argv[0]); }
        catch (FormatException) { throw new ArgumentException("launch config is not Base64"); }
        object parsed = new JavaScriptSerializer().DeserializeObject(Encoding.UTF8.GetString(raw));
        Dictionary<string, object> map = parsed as Dictionary<string, object>;
        if (map == null) throw new ArgumentException("launch config must be an object");
        LaunchConfig result = new LaunchConfig();
        result.Executable = RequiredString(map, "executable");
        result.Cwd = RequiredString(map, "cwd");
        result.CodeXHome = RequiredString(map, "codeXHome");
        result.Args = RequiredStrings(map, "args");
        result.Cols = PositiveDimension(map, "cols");
        result.Rows = PositiveDimension(map, "rows");
        RejectNul(result.Executable, "executable"); RejectNul(result.Cwd, "cwd"); RejectNul(result.CodeXHome, "codeXHome");
        foreach (string arg in result.Args) RejectNul(arg, "args");
        return result;
    }

    private static void ControlLoop()
    {
        try
        {
            Stream stdin = Console.OpenStandardInput();
            while (true)
            {
                byte[] frame = ReadFrame(stdin);
                // Transport EOF is not a terminal hangup. Closing this pipe before the
                // suspended child has attached makes ConPTY deliver a CTRL_CLOSE-like exit.
                // The owner closes it after child exit or forced termination instead.
                if (frame == null) return;
                Dictionary<string, object> message = new JavaScriptSerializer().DeserializeObject(Encoding.UTF8.GetString(frame)) as Dictionary<string, object>;
                if (message == null) throw new ArgumentException("frame must be a JSON object");
                string type = RequiredString(message, "type");
                if (type == "input")
                {
                    byte[] input = DecodeInput(RequiredString(message, "data"));
                    WritePty(input);
                }
                else if (type == "resize")
                {
                    short cols = PositiveDimension(message, "cols");
                    short rows = PositiveDimension(message, "rows");
                    int resizeResult = ResizePseudoConsole(_pseudoConsole, new Coord { X = cols, Y = rows });
                    if (resizeResult < 0) throw new InvalidOperationException("ResizePseudoConsole failed: 0x" + resizeResult.ToString("X8"));
                }
                else if (type == "interrupt") WritePty(new byte[] { 3 });
                else if (type == "terminate") { ForceTerminate(); return; }
                else throw new ArgumentException("unsupported frame type");
            }
        }
        catch (Exception error)
        {
            Diagnostic("control protocol: " + error.Message);
            if (Interlocked.CompareExchange(ref _childExited, 0, 0) == 0) ForceTerminate();
        }
    }

    private static void PumpOutput(IntPtr output)
    {
        try
        {
            Stream stdout = Console.OpenStandardOutput();
            byte[] buffer = new byte[8192];
            int count;
            while (ReadFile(output, buffer, buffer.Length, out count, IntPtr.Zero))
            {
                if (count != 0) { stdout.Write(buffer, 0, count); stdout.Flush(); }
            }
        }
        catch (Exception error) { Diagnostic("output pump: " + error.Message); }
    }

    private static void ForceTerminate()
    {
        if (Interlocked.Exchange(ref _terminated, 1) == 0) { CloseJob(); ClosePtyInput(); }
    }

    private static void ClosePseudoConsoleAndDrain(Thread outputThread)
    {
        if (_pseudoConsole != IntPtr.Zero) { ClosePseudoConsole(_pseudoConsole); _pseudoConsole = IntPtr.Zero; }
        if (outputThread != null && !outputThread.Join(2000))
        {
            Diagnostic("output drain exceeded 2000 ms; closing output pipe");
        }
    }

    private static void ClosePtyInput()
    {
        lock (InputLock) { if (_ptyInput != IntPtr.Zero) { CloseHandle(_ptyInput); _ptyInput = IntPtr.Zero; } }
    }

    private static void CloseJob()
    {
        IntPtr job = Interlocked.Exchange(ref _job, IntPtr.Zero);
        if (job != IntPtr.Zero) CloseHandle(job);
    }

    private static IntPtr CreateKillOnCloseJob()
    {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw LastError("CreateJobObject");
        ExtendedLimitInformation limits = new ExtendedLimitInformation();
        limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
        if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, ref limits, Marshal.SizeOf(typeof(ExtendedLimitInformation)))) { CloseHandle(job); throw LastError("SetInformationJobObject"); }
        return job;
    }

    private static void WritePty(byte[] bytes)
    {
        lock (InputLock)
        {
            if (_ptyInput == IntPtr.Zero) return;
            int offset = 0;
            while (offset < bytes.Length)
            {
                int remaining = bytes.Length - offset;
                byte[] chunk;
                if (offset == 0) chunk = bytes;
                else { chunk = new byte[remaining]; Buffer.BlockCopy(bytes, offset, chunk, 0, remaining); }
                int written;
                if (!WriteFile(_ptyInput, chunk, remaining, out written, IntPtr.Zero)) throw LastError("WriteFile(ConPTY input)");
                if (written == 0) throw new IOException("WriteFile(ConPTY input) wrote zero bytes");
                offset += written;
            }
        }
    }

    private static byte[] ReadFrame(Stream stream)
    {
        MemoryStream buffer = new MemoryStream();
        while (true)
        {
            int next = stream.ReadByte();
            if (next < 0)
            {
                if (buffer.Length == 0) return null;
                throw new ArgumentException("unterminated control frame");
            }
            if (next == '\n') return buffer.ToArray();
            if (buffer.Length >= MaxFrameBytes) throw new ArgumentException("control frame exceeds 1 MiB");
            buffer.WriteByte((byte)next);
        }
    }

    private static byte[] DecodeInput(string data)
    {
        byte[] input;
        try { input = Convert.FromBase64String(data); }
        catch (FormatException) { throw new ArgumentException("input data is not Base64"); }
        if (input.Length > MaxInputBytes) throw new ArgumentException("input data exceeds 64 KiB");
        return input;
    }

    private static string RequiredString(Dictionary<string, object> map, string name)
    {
        object value;
        if (!map.TryGetValue(name, out value) || !(value is string) || ((string)value).Length == 0) throw new ArgumentException(name + " must be a non-empty string");
        return (string)value;
    }

    private static string[] RequiredStrings(Dictionary<string, object> map, string name)
    {
        object value;
        if (!map.TryGetValue(name, out value)) throw new ArgumentException(name + " must be an array of strings");
        object[] array = value as object[];
        ArrayList list = value as ArrayList;
        int count = array != null ? array.Length : list != null ? list.Count : -1;
        if (count < 0) throw new ArgumentException(name + " must be an array of strings");
        string[] values = new string[count];
        for (int i = 0; i < count; i++)
        {
            object item = array != null ? array[i] : list[i];
            values[i] = item as string;
            if (values[i] == null) throw new ArgumentException(name + " must be an array of strings");
        }
        return values;
    }

    private static short PositiveDimension(Dictionary<string, object> map, string name)
    {
        object value;
        int dimension;
        if (!map.TryGetValue(name, out value) || !TryInt32(value, out dimension) || dimension <= 0 || dimension > short.MaxValue) throw new ArgumentException(name + " must be a positive 16-bit integer");
        return (short)dimension;
    }

    private static bool TryInt32(object value, out int result)
    {
        if (value is int) { result = (int)value; return true; }
        if (value is decimal) { decimal d = (decimal)value; if (d == Decimal.Truncate(d) && d >= Int32.MinValue && d <= Int32.MaxValue) { result = (int)d; return true; } }
        result = 0; return false;
    }

    private static string BuildCommandLine(string executable, string[] args)
    {
        StringBuilder result = new StringBuilder(QuoteWindowsArgument(executable));
        foreach (string arg in args) result.Append(' ').Append(QuoteWindowsArgument(arg));
        return result.ToString();
    }

    private static string QuoteWindowsArgument(string value)
    {
        if (value.Length != 0 && value.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return value;
        StringBuilder quoted = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value)
        {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') quoted.Append('\\', slashes * 2 + 1).Append('"');
            else { if (slashes != 0) quoted.Append('\\', slashes); quoted.Append(c); }
            slashes = 0;
        }
        if (slashes != 0) quoted.Append('\\', slashes * 2);
        return quoted.Append('"').ToString();
    }

    private static void RejectNul(string value, string name) { if (value.IndexOf('\0') >= 0) throw new ArgumentException(name + " must not contain NUL"); }
    private static void Check(bool success, string operation) { if (!success) throw LastError(operation); }
    private static Exception LastError(string operation) { return new InvalidOperationException(operation + " failed: " + Marshal.GetLastWin32Error()); }
    private static void Diagnostic(string message) { try { Console.Error.WriteLine("windows-conpty: " + message); } catch { } }
}
