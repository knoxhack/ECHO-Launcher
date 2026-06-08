!ifndef BUILD_UNINSTALLER
Var previousSpacedInstallDir

!macro customInit
  StrCpy $previousSpacedInstallDir ""

  StrCpy $0 $INSTDIR 14 -14
  ${If} $0 == "\ECHO Launcher"
    StrLen $1 $INSTDIR
    IntOp $1 $1 - 14
    StrCpy $2 $INSTDIR $1
    StrCpy $INSTDIR "$2\ECHOLauncher"
  ${EndIf}

  ${If} ${FileExists} "$LocalAppData\Programs\ECHO Launcher\ECHO Launcher.exe"
    StrCpy $previousSpacedInstallDir "$LocalAppData\Programs\ECHO Launcher"
  ${EndIf}

  ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 == "$LocalAppData\Programs\ECHO Launcher"
    StrCpy $previousSpacedInstallDir "$0"
    DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"
    DeleteRegKey SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}"
  ${EndIf}
!macroend

!macro customInstall
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayName" "ECHO Launcher"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "Publisher" "KnoxHack"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "URLInfoAbout" "https://github.com/knoxhack/ECHO-Launcher"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "URLUpdateInfo" "https://github.com/knoxhack/ECHO-Launcher/releases"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "HelpLink" "https://github.com/knoxhack/ECHO-Launcher/issues"

  ${If} ${FileExists} "$newStartMenuLink"
    StrCpy $0 "$INSTDIR\resources\app.asar.unpacked\build\icon.ico"
    ${IfNot} ${FileExists} "$0"
      StrCpy $0 "$appExe"
    ${EndIf}

    Delete "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$0" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${EndIf}

  ${If} $previousSpacedInstallDir != ""
  ${AndIf} $previousSpacedInstallDir != "$INSTDIR"
    ${If} ${FileExists} "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
      nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -C "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$previousSpacedInstallDir', 'CurrentCultureIgnoreCase')} | % { Stop-Process -Id $$_.ProcessId -Force }"`
      Pop $0
      Sleep 500
    ${EndIf}

    RMDir /r "$previousSpacedInstallDir"
  ${EndIf}
!macroend
!endif

!macro customUnInstall
  ${GetParameters} $0
  ${GetOptions} $0 "/KEEP_APP_DATA" $1
  ${If} ${Errors}
  ${AndIfNot} ${isUpdated}
    RMDir /r "$APPDATA\echo-launcher"
    RMDir /r "$PROFILE\ECHOLauncher"
  ${EndIf}
!macroend
