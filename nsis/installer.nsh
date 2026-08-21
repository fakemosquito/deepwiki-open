!macro customInstall
  DetailPrint "DeepWiki starts its wiki stack with Docker Desktop after you launch the app."
!macroend

!macro customUnInstall
  DetailPrint "Leaving Docker volumes in place. Remove %APPDATA%\\DeepWiki if you want a clean uninstall."
!macroend
