"use strict";

var RoonApi = require("node-roon-api"),
    RoonApiSettings  = require('node-roon-api-settings'),
    RoonApiStatus    = require('node-roon-api-status'),
    RoonApiTransport = require('node-roon-api-transport');

var HID = require('node-hid');
HID.setDriverType('libusb');
var util = require('util');
var events = require('events');

var allDevices;
var core;
var playingstate = '';
var mute = 'unmute';
var shuffleState = false;

const SN_VENDOR_ID = 0x046D;
const SN_PRODUCT_ID = 0xC626;
const SMC_VENDOR_ID = 0x256F;
const SMC_PRODUCT_ID = 0xC635;

const seekRate = 50;
const seekTimeOut = 500;
const playPauseTimeOut = 500;

var roon = new RoonApi({
    extension_id:        'de.angisoft.roonspacenav',
    display_name:        'SpaceMouse Volume Control',
    display_version:     '1.2.3',
    publisher:           'Klaus Engel',
    log_level: 			 'none', 
    email:               'klaus.engel@gmail.com',
    website:             'https://github.com/KlausDEngel/roon-spacenav',

    core_paired: function(core_) {
        core = core_;

        let transport = core.services.RoonApiTransport;
        transport.subscribe_zones(function(cmd, data) {
	    try {
		if (cmd == "Changed" && data['zones_changed']) {
		    data.zones_changed.forEach(z => {
			if (z.outputs) {
			    let found = false;
			    z.outputs.forEach(o => { //console.log(o.output_id, mysettings.zone.output_id); 
			    	found = found || o.output_id == mysettings.zone.output_id; });
			    if (found) {
				if (playingstate != z.state) {
				    playingstate = z.state;
				    update_led();
				}
			    }
			}
		    });
		}
	    } catch (e) {
	    	console.log(e);
	    }
	});
    },
    core_unpaired: function(core_) {
	core = undefined;
    }
});

var mysettings = Object.assign({
    zone:             null,
    led: "whenplaying",
    press: "playpause",
    volumeAxis: "y",
    invertVolume: "no",
    seekAxis: "x",
    invertSeek: "no",
    left: "previous",
    right: "next",
    sensitivity: 20,
    sensitivitySeek: 20,
    thresholdSeek: 25,
    thresholdPlayPause: 80
}, roon.load_config("settings") || {});

function makelayout(settings) {
    var l = {
        values:    settings,
		layout:    [],
		has_error: false
    };

    l.layout.push({
	type:    "zone",
	title:   "Zone",
	setting: "zone",
    });

    l.layout.push({
	type:    "dropdown",
	title:   "LED Status",
	values:  [
	    { title: "Always On",        value: "on" },
	    { title: "On when playing",  value: "whenplaying" },
	    { title: "Off",              value: "off" },
	],
	setting: "led",
    });

    l.layout.push({
	type:    "dropdown",
	title:   "Press Down",
	values:  [
	    { title: "Play/Pause",        value: "playpause" },
	    { title: "Mute/Unmute",  	  value: "muteunmute" },
	    { title: "Next Track",  	  value: "next" },
	    { title: "Shuffle",           value: "shuffle" },
	    { title: "Off",               value: "off" },
	],
	setting: "press",
    });

    l.layout.push({
	type:    "dropdown",
	title:   "Volume Axis",
	values:  [
	    { title: "X-Rotation",        value: "x" },
	    { title: "Y-Rotation",  	  value: "y" },
	    { title: "Z-Rotation",  	  value: "z" },
	    { title: "Off",           value: "off" },
	],
	setting: "volumeAxis",
    });

    l.layout.push({
	type:    "dropdown",
	title:   "Invert Volume Axis",
	values:  [
	    { title: "Yes",       value: "yes" },
	    { title: "No",  	  value: "no" },
	],
	setting: "invertVolume",
    });

    l.layout.push({
	type:    "dropdown",
	title:   "Seek Axis",
	values:  [
	    { title: "X-Translation",        value: "x" },
	    { title: "Y-Translation",  	  value: "y" },
	    { title: "Z-Translation",  	  value: "z" },
	    { title: "Off",           value: "off" },
	],
	setting: "seekAxis",
    });

    l.layout.push({
	type:    "dropdown",
	title:   "Invert Seek Axis",
	values:  [
	    { title: "Yes",       value: "yes" },
	    { title: "No",  	  value: "no" },
	],
	setting: "invertSeek",
    });

    l.layout.push({
	type:    "dropdown",
	title:   "Left Button",
	values:  [
	    { title: "Previous Track",        value: "previous" },
	    { title: "Next Track",  value: "next" },
	    { title: "Play/Pause",        value: "playpause" },
	    { title: "Mute/Unmute",  	  value: "muteunmute" },
	    { title: "Shuffle",              value: "shuffle" },
	    { title: "Off",              value: "off" },
	],
	setting: "left",
    });

    l.layout.push({
	type:    "dropdown",
	title:   "Right Button",
	values:  [
	    { title: "Previous Track",        value: "previous" },
	    { title: "Next Track",  value: "next" },
	    { title: "Play/Pause",        value: "playpause" },
	    { title: "Mute/Unmute",  	  value: "muteunmute" },
	    { title: "Shuffle",              value: "shuffle" },
	    { title: "Off",              value: "off" },
	],
	setting: "right",
    });

    if (settings.sensitivity != "none") {
		let v = {
		    type:    "integer",
		    min:     1,
		    max:     100,
		    title:   "Volume Sensitivity",
		    setting: "sensitivity"
		};
		if (settings.sensitivity < v.min || settings.sensitivity > v.max) {
		    v.error = "Sensitivity must be between 1 and 100.";
		    l.has_error = true; 
		}
	    l.layout.push(v);
	}
    if (settings.sensitivitySeek != "none") {
		let v = {
		    type:    "integer",
		    min:     1,
		    max:     100,
		    title:   "Seek Sensitivity",
		    setting: "sensitivitySeek"
		};
		if (settings.sensitivitySeek < v.min || settings.sensitivitySeek > v.max) {
		    v.error = "Seek Sensitivity must be between 1 and 100.";
		    l.has_error = true; 
		}
	    l.layout.push(v);
	}
    if (settings.thresholdSeek != "none") {
		let v = {
		    type:    "integer",
		    min:     1,
		    max:     100,
		    title:   "Seek Threshold",
		    setting: "thresholdSeek"
		};
		if (settings.thresholdSeek < v.min || settings.thresholdSeek > v.max) {
		    v.error = "Seek Threshold must be between 1 and 100.";
		    l.has_error = true; 
		}
	    l.layout.push(v);
	}
    if (settings.thresholdPlayPause != "none") {
		let v = {
		    type:    "integer",
		    min:     1,
		    max:     100,
		    title:   "Play/Pause Threshold",
		    setting: "thresholdPlayPause"
		};
		if (settings.thresholdPlayPause < v.min || settings.thresholdPlayPause > v.max) {
		    v.error = "Play/Pause Threshold must be between 1 and 100.";
		    l.has_error = true; 
		}
	    l.layout.push(v);
	}

    return l;
}

var svc_settings = new RoonApiSettings(roon, {
    get_settings: function(cb) {
        cb(makelayout(mysettings));
    },
    save_settings: function(req, isdryrun, settings) {
	let l = makelayout(settings.values);
        req.send_complete(l.has_error ? "NotValid" : "Success", { settings: l });

        if (!isdryrun && !l.has_error) {
            mysettings = l.values;
            svc_settings.update_settings(l);
            roon.save_config("settings", mysettings);
	    	update_led();
        }
    }
});

var svc_status = new RoonApiStatus(roon);

roon.init_services({
    required_services:   [ RoonApiTransport ],
    provided_services:   [ svc_settings, svc_status ],
});

function getAllDevices()
{
    if (!allDevices) 
    {
        allDevices = HID.devices(SMC_VENDOR_ID, SMC_PRODUCT_ID);
		if (allDevices.length)
			console.log("SpaceMouse Compact found.");
		else
		{
	        allDevices = HID.devices(SN_VENDOR_ID, SN_PRODUCT_ID);
			if (allDevices.length)
				console.log("SpaceNavigator found.");
			else
				console.log("No devices found.");

		}
	}

    return allDevices;
}

function update_status() {
    if (spacemouse &&spacemouse.hid)
    {
		svc_status.set_status("Connected to SpaceMouse.", false);
    }
    else
    {
		svc_status.set_status("Could not find USB device.", true);
    }
}

function update_led() {
    if (spacemouse.hid) 
    {
		if (mysettings.led == "on") 
		{
	    	spacemouse.hid.write([0x04,0x01]);
        } 
        else 
        	if (mysettings.led == "whenplaying") 
        	{
	    		if (playingstate == "playing")
	        		spacemouse.hid.write([0x04,0x01]);	
	    		else
					spacemouse.hid.write([0x04,0x00]);
        	} 
        	else 
        	{
	    		spacemouse.hid.write([0x04,0x00]);
			}
    }
}

function SpaceMouse(index)
{
    if (!arguments.length) {
        index = 0;
    }

    var spaceMice = getAllDevices();
    if (!spaceMice.length) {
//        console.log("No Space Mouse Compact or SpaceNavigator could be found");
        throw new Error("No Space Mouse could be found");
    }
    if (index > spaceMice.length || index < 0) {
        throw new Error("Index " + index + " out of range, only " + spaceMice.length + " Space Mice found");
    }

    if (this.hid) {
        this.hid.close();
		this.hid = undefined;
    }

    try {
		    this.hid = new HID.HID(spaceMice[index].path);
    	//this.hid.write([0x04, 0x01]);
    	this.hid.on('data', this.interpretData.bind(this));
    } catch (e) {
			console.log(e);
    }
 }

util.inherits(SpaceMouse, events.EventEmitter);

SpaceMouse.prototype.interpretData = function(data) {
    function parseData(xl, xh, zl, zh, yl, yh)
    {
        function adjust(x) { // we get an improperly parsed two's complement int
            return (x > 1000 ? 65536 - x : -x) / 350;
        }

        return {
            x: adjust(xl + (xh << 8)),
            y: adjust(yl + (yh << 8)),
            z: adjust(zl + (zh << 8))
        };
    }

//	console.log('translate: ', JSON.stringify(data));
   if (data[0] === 0x17)
   {
   		return;
   }
   if (data[0] === 0x03)
    {
       	try {
        	if (data[1] == 0x02)
        	{
//			    console.log('Button right!');
			    if (core)
			    {
			    	if (mysettings.right == 'next')
	        			core.services.RoonApiTransport.control(mysettings.zone, 'next');
	        		else
			    	if (mysettings.right == 'previous')
	        			core.services.RoonApiTransport.control(mysettings.zone, 'previous');
	        		else
			    	if (mysettings.right == 'shuffle')
	        			core.services.RoonApiTransport.change_settings(mysettings.zone, {shuffle: (shuffleState=!shuffleState)});
	        		else
			    	if (mysettings.right == 'playpause')
						core.services.RoonApiTransport.control(mysettings.zone, 'playpause');
	        		else
			    	if (mysettings.right == 'muteunmute')
			    	{

			    		if (mute == 'unmute')
			    			mute = 'mute';
			    		else
			    			mute = 'unmute';
						core.services.RoonApiTransport.mute(mysettings.zone, mute);
			    	}
			    }
        	}
	    	if (data[1] == 0x01)
	    	{
//			    console.log('Button left!');
			    	if (mysettings.left == 'next')
	        			core.services.RoonApiTransport.control(mysettings.zone, 'next');
	        		else
			    	if (mysettings.left == 'previous')
	        			core.services.RoonApiTransport.control(mysettings.zone, 'previous');
	        		else
			    	if (mysettings.left == 'shuffle')
	        			core.services.RoonApiTransport.change_settings(mysettings.zone, {shuffle: (shuffleState=!shuffleState)});
	    	}

      	} catch (e) {}
      	return;
    }
    var transform = parseData.apply(parseData, data.slice(1));
	if (data[0] ===  0x01)
	{
    	this.emit('translate', transform);
    }
    else
    if (data[0] === 0x02)
    {
		this.emit('rotate', transform);
	}
 };

var lastTime;

var spacemouse;
function setup_spacemouse() {

	init_signal_handlers();

try {
	spacemouse = new SpaceMouse();
	lastTime = Date.now();

	spacemouse.on('translate', (translation) => {
//	    console.log('translate: ', JSON.stringify(translation));

//     if (!core) return;

	    try {
	    	var signSeek = 1.;
	    	if (mysettings.invertSeek == 'yes')
	    		signSeek = -signSeek;
	    	var valueSeek = 0.;
	    	if (mysettings.seekAxis == 'x')
		    	valueSeek = translation.x;
		    else
	    	if (mysettings.seekAxis == 'y')
		    	valueSeek = translation.y;
		    else
	    	if (mysettings.seekAxis == 'z')
		    	valueSeek = translation.z;

		    if (Math.abs(valueSeek) > mysettings.thresholdSeek/100.)
			{
				if ((Date.now() - lastTime) > seekRate)
			    {
//				    console.log('seek: ', JSON.stringify(translation.x));
				    if (core)
			    		core.services.RoonApiTransport.seek(mysettings.zone, 'relative', -mysettings.sensitivitySeek/4. * valueSeek * signSeek);
			    	lastTime = Date.now();
			    }
			}
			else
	    	if (Math.abs(translation.y) > mysettings.thresholdPlayPause/100.)
			{
				if ((Date.now() - lastTime) > playPauseTimeOut)
		    	{
//				    console.log('Play/Pause!');
				    if (core)
				    {
				    	if (mysettings.press == 'playpause')
							core.services.RoonApiTransport.control(mysettings.zone, 'playpause');
						else
			    		if (mysettings.press == 'muteunmute')
						{
				    		if (mute == 'unmute')
				    			mute = 'mute';
				    		else
				    			mute = 'unmute';
							core.services.RoonApiTransport.mute(mysettings.zone, mute);
						}
						else
			    		if (mysettings.press == 'next')
						{
		        			core.services.RoonApiTransport.control(mysettings.zone, 'next');
						}
						else
			    		if (mysettings.press == 'shuffle')
						{
		        			core.services.RoonApiTransport.change_settings(mysettings.zone, {shuffle: (shuffleState=!shuffleState)});
						}
				    }
			    	lastTime = Date.now();
		    	}
		    }
		} catch (e) {
			console.log(e);
		}
	});

	spacemouse.on('rotate', (rotation) => {
//	console.log('rotate: ', JSON.stringify(rotation));
//    console.log(JSON.stringify(rotation.y));

//     if (!core) return;

	    try {
	    	var signVolume = -1.;
	    	if (mysettings.invertVolume == 'yes')
	    		signVolume = -signVolume;
	    	var valueVolume = 0.;
	    	if (mysettings.volumeAxis == 'x')
		    	valueVolume = rotation.x;
		    else
	    	if (mysettings.volumeAxis == 'y')
		    	valueVolume = rotation.y;
		    else
	    	if (mysettings.volumeAxis == 'z')
		    	valueVolume = rotation.z;

		    if (valueVolume != 0.)
		    {
				if ((Date.now() - lastTime) > seekTimeOut)
				{
//				    console.log('volume: ', JSON.stringify(rotation.y));
				    if (core)
			    		core.services.RoonApiTransport.change_volume(mysettings.zone, 'relative_step', signVolume * valueVolume * mysettings.sensitivity/20.);
				}
		    }
	 	} catch (e) {
			console.log(e);
	 	}
	});

	update_status();
	update_led();
    } catch (e) {
	console.log(e);
    }	
}

setup_spacemouse();
update_status();

roon.start_discovery();
setInterval(() => { 
	if (!spacemouse || !spacemouse.hid) setup_spacemouse(); 
}, 1000);

function init_signal_handlers() {
    const handle = function(signal) {
        process.exit(0);
    };

    // Register signal handlers to enable a graceful stop of the container
    process.on('SIGTERM', handle);
    process.on('SIGINT', handle);
}
