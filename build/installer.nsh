; Windows NSIS custom install/uninstall hooks for UECFI Presenter.
; Adds Windows Defender Firewall inbound rules for the built-in LAN Remote Server
; (TCP HTTP/WebSocket + UDP discovery) so phones and Android remotes can connect
; even when venue Wi-Fi is classified as a Public network.

!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="UECFI Presenter (LAN Remote)"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="UECFI Presenter (LAN Remote)" dir=in action=allow program="$INSTDIR\UECFI Presenter.exe" enable=yes profile=any protocol=TCP'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="UECFI Presenter (LAN Remote)" dir=in action=allow program="$INSTDIR\UECFI Presenter.exe" enable=yes profile=any protocol=UDP'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="UECFI Presenter (LAN Remote)"'
!macroend
