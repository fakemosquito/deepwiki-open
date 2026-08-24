!macro customInstall
  DetailPrint "DeepWiki bundles Python 3.11, Node, and Git. The system Python is not used."
!macroend

!macro customUnInstall
  DetailPrint "Leaving app data in place. Remove %APPDATA%\\DeepWiki if you want a clean uninstall."
!macroend
