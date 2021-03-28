# roon-spacenav
A volume control Roon extension for the 3dconnexion USB SpaceNavigator space mouse. Rotating the knob will change the volume, right button will skip to next track and left button will skip to previous track. It also works on Raspberry Pi, so the SpaceNavigator can be connected to a Pi Roon bridge directly. It is tested with the USB SpaceNavigator. Other device compatibility is not guaranteed. It uses RAW USB HID communication, so no drivers for the space mouse are required.

Controls:
- Rotate left and right to change volume
- Translate x-axis to seek
- Press down to play/pause
- press left/right button for previous/next track 

```
##Usage
npm install
node .
```
![IMG_0951](https://user-images.githubusercontent.com/81231318/112766515-84fe4700-9012-11eb-8191-0868e71a81c6.jpg)
![Screenshot from 2021-03-28 22-10-25](https://user-images.githubusercontent.com/81231318/112766548-95162680-9012-11eb-9651-d4067045e072.png)
