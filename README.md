# roon-spacenav
A volume control Roon extension for 3dconnexion SpaceNavigator and SpaceMouse Compact. Rotating the knob will change the volume, right button will skip to next track and left button will skip to previous track. Pressing down on the knob will Play/Pause. Translating the knob along the x-axis will seek. The extension also works on Raspberry Pi, so the Space Mice can be connected to a Pi Roon bridge directly. It uses RAW USB HID communication, so no drivers for the space mice are required.

A version for 3dconnexion SpaceMouse Wireless will be available soon at https://rooextend.com/.

Controls:
- Rotate left and right to change volume
- Translate x-axis to seek
- Press down to play/pause
- press left/right button for previous/next track 

```
##Usage
git clone https://github.com/KlausDEngel/roon-spacenav
cd roon-spacenav
npm install
sudo node .
```

![IMG_0951](https://user-images.githubusercontent.com/81231318/112766515-84fe4700-9012-11eb-8191-0868e71a81c6.jpg)
![Screenshot from 2021-03-28 22-10-25](https://user-images.githubusercontent.com/81231318/112766548-95162680-9012-11eb-9651-d4067045e072.png)
