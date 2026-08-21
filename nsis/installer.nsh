!macro customInstall
  DetailPrint "DeepWiki runs the wiki frontend and API locally. Docker is not required."
!macroend

!macro customUnInstall
  DetailPrint "Leaving app data in place. Remove %APPDATA%\\DeepWiki if you want a clean uninstall."
!macroend
