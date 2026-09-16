!macro customUnInstall
  ${ifNot} ${isKeepShortcuts}
    Delete "$DESKTOP\ReelSave.lnk"
    Delete "$APPDATA\ReelSave\assets\reelsave.ico"
    Delete "$APPDATA\ReelSave\assets\desktop-shortcut.json"
  ${endIf}
!macroend
