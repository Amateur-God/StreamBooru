# StreamBooru — Install and Usage

## Debian/Ubuntu (.deb)
```bash
sudo apt install ./StreamBooru-*.deb
```

## Windows (.exe)
Run `StreamBooru-Setup-<version>.exe`, then start from the menu.

## Flatpak (.flatpak)
```bash
# First-time setup (Debian/Ubuntu):
sudo apt install flatpak
sudo flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo

flatpak install --user ./StreamBooru.flatpak
flatpak run io.streambooru.StreamBooru
```

## Generic tar.gz
```bash
tar xf StreamBooru-*-linux-x64.tar.gz
cd StreamBooru-*-linux-x64
./streambooru
# Wayland tip:
# ./streambooru --ozone-platform-hint=x11
```
