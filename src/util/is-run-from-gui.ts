import * as childProcess from 'child_process';

/* istanbul ignore next */
export const isRunFromWindowsGUI = (): boolean => {
    if (process.platform !== 'win32') {
        return false;
    }

    // wmic.exe was removed in Windows 11 24H2+;
    // query the parent process via PowerShell CIM
    // with the same KEY=VALUE output wmic /VALUE produced
    // eslint-disable-next-line prefer-template
    const stdout = (childProcess.spawnSync(
        'powershell',
        [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `Get-CimInstance Win32_Process -Filter 'ProcessId = ${process.ppid}' `
                + '| ForEach-Object { \'Name={0}\' -f $_.Name; \'ProcessId={0}\' -f $_.ProcessId; \'\' }',
        ],
    ).stdout + '')
        .replace(/\r/g, '')
        .split('\n\n')
        .filter((x) => !!x)
        .map(
            (x) => x
                .split('\n')
                .filter((y) => !!y)
                .map((y) => {
                    const equalIdx = y.indexOf('=');
                    return [y.slice(0, equalIdx).trim(), y.slice(equalIdx + 1).trim()];
                }),
        )
        .filter((x) => x[1][1] === `${process.ppid}`);

    if (!stdout?.length) {
        return false;
    }

    const parentName = stdout[0]?.[0]?.[1]?.toLowerCase();
    return (
        parentName === 'ApplicationFrameHost.exe'.toLowerCase()
        || parentName === 'explorer.exe'
    );
};
