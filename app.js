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
var wireless = '';
var checkUSB = '';
var batteryLevel = 100

const SN_VENDOR_ID = 0x046D;
const SN_PRODUCT_ID = 0xC626;
const SMC_VENDOR_ID = 0x256F;
const SMC_PRODUCT_ID = 0xC635;
const SMW_VENDOR_ID = 0x256F;
const SMW_PRODUCT_ID = 0xC62E;
const UR_VENDOR_ID = 0x256F;
const UR_PRODUCT_ID = 0xC652;

const seekRate = 50;
const seekTimeOut = 500;
const playPauseTimeOut = 500;

var roon = new RoonApi({
    extension_id:        'de.angisoft.roonspacenav',
    display_name:        'SpaceMouse Volume Control',
    display_version:     '1.2.1',
    publisher:           'Klaus Engel',
    log_level:		 'none', 
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
    sensitivity: 20,
    sensitivitySeek: 20,
    thresholdSeek: 25,
    thresholdPlayPause: 40
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
    if (!allDevices) {
        allDevices = HID.devices(SMC_VENDOR_ID, SMC_PRODUCT_ID);
		if (allDevices.length)
			console.log("SpaceMouse Compact found.");
		if (!allDevices.length) {
	        allDevices = HID.devices(SMW_VENDOR_ID, SMW_PRODUCT_ID);
			if (allDevices.length)
			{
				console.log("SpaceMouse Wireless found.");
				wireless = 'true';
			}
			if (!allDevices.length) {
		        allDevices = HID.devices(SN_VENDOR_ID, SN_PRODUCT_ID);
				if (allDevices.length)
					console.log("SpaceNavigator found.");
				if (!allDevices.length) {
			        allDevices = HID.devices(UR_VENDOR_ID, UR_PRODUCT_ID);
					if (allDevices.length)
					{
						console.log("Universal Receiver found.");
						wireless = 'true';
						checkUSB = 'true';
					}
					else
						console.log("No devices found.");
				}
	        }

		}
    }
    return allDevices;
}

function update_status() {
    if (spacenav &&spacenav.hid)
    {
		svc_status.set_status("Connected to SpaceMouse Wireless. Battery: " + JSON.stringify(batteryLevel) + "%.", false);
//		console.log("Connected to SpaceMouse Wireless. Battery: " + JSON.stringify(batteryLevel) + "%.");
    }
    else
    {
    	if (wireless)
			svc_status.set_status("Could not find USB device.", true);
		else
			svc_status.set_status("Could not find USB device.", true);
	    // force restart on USB reconnect with Space Mouse Wireless
	    if (checkUSB == 'true')
	        process.exit(0);
    }
}

function update_led() {
    if (spacenav.hid) 
    {
		if (mysettings.led == "on") 
		{
	    	spacenav.hid.write([0x04,0x01]);
        } 
        else 
        	if (mysettings.led == "whenplaying") 
        	{
	    		if (playingstate == "playing")
	        		spacenav.hid.write([0x04,0x01]);	
	    		else
					spacenav.hid.write([0x04,0x00]);
        	} 
        	else 
        	{
	    		spacenav.hid.write([0x04,0x00]);
			}
    }
}

function SpaceNavigator(index)
{
    if (!arguments.length) {
        index = 0;
    }

    var spaceNavs = getAllDevices();
    if (!spaceNavs.length) {
//        console.log("No Space Mouse Compact or SpaceNavigator could be found");
        throw new Error("No Space Mouse could be found");
    }
    if (index > spaceNavs.length || index < 0) {
        throw new Error("Index " + index + " out of range, only " + spaceNavs.length + " Space Mice found");
    }

    if (this.hid) {
        this.hid.close();
		this.hid = undefined;
    }

    try {
		    this.hid = new HID.HID(spaceNavs[index].path);
    	//this.hid.write([0x04, 0x01]);
    	this.hid.on('data', this.interpretData.bind(this));
    } catch (e) {
			console.log(e);
    }
 }

util.inherits(SpaceNavigator, events.EventEmitter);

SpaceNavigator.prototype.interpretData = function(data) {
    //http://www.mullist.com/2015/01/09/getting-node-hid-to-work-on-windows/
    //https://www.3dconnexion.com/forum/viewtopic.php?t=3983
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
   		batteryLevel = data[1];
//		console.log('battery level: ', JSON.stringify(batteryLevel));
		update_status();
   		return;
   }
   if (data[0] === 3)
    {
       	try {
        	if (data[1] == 2)
        	{
//			    console.log('Button right!');
			    if (core)
	        		core.services.RoonApiTransport.control(mysettings.zone, 'next');
        	}
	    	if (data[1] == 1)
	    	{
//			    console.log('Button left!');
			    if (core)
	        		core.services.RoonApiTransport.control(mysettings.zone, 'previous');
	    	}

      	} catch (e) {}
      	return;
    }
   var transform = parseData.apply(parseData, data.slice(1));
	if (wireless == "true")
	{
    	if (data[0] === 1)
    	{
			var transform2 = parseData.apply(parseData, data.slice(7));
	    	this.emit('translate', transform);
	    	this.emit('rotate', transform2);
    	}
    }
	else
    {
    	if (data[0] === 1)
    	{
	    	this.emit('translate', transform);
	    }
	    else
	    if (data[0] === 2)
	    {
    		this.emit('rotate', transform);
    	}
    }
 };

var lastTime;

var spacenav;
function setup_spacenav() {
	try {
	spacenav = new SpaceNavigator();
	lastTime = Date.now();
	spacenav.on('translate', (translation) => {
//	    console.log('translate: ', JSON.stringify(translation));

//     if (!core) return;

	    try {
		    if (Math.abs(translation.x) > mysettings.thresholdSeek/100.)
			{
				if ((Date.now() - lastTime) > seekRate)
			    {
//				    console.log('seek: ', JSON.stringify(translation.x));
				    if (core)
			    		core.services.RoonApiTransport.seek(mysettings.zone, 'relative', -mysettings.sensitivitySeek/4. * translation.x);
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
						core.services.RoonApiTransport.control(mysettings.zone, 'playpause');
			    	lastTime = Date.now();
		    	}
		    }
		} catch (e) {
			console.log(e);
		}
	});

	spacenav.on('rotate', (rotation) => {
//	console.log('rotate: ', JSON.stringify(rotation));
//    console.log(JSON.stringify(rotation.y));

//     if (!core) return;

	    try {
		    if (rotation.y != 0.)
		    {
				if ((Date.now() - lastTime) > seekTimeOut)
				{
//				    console.log('volume: ', JSON.stringify(rotation.y));
				    if (core)
			    		core.services.RoonApiTransport.change_volume(mysettings.zone, 'relative_step', -1 * rotation.y * mysettings.sensitivity/20.);
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

setup_spacenav();
update_status();

roon.start_discovery();
setInterval(() => { 
	if (checkUSB == 'true')
	{
		// check for USB reconnect
		allDevices = HID.devices(SMW_VENDOR_ID, SMW_PRODUCT_ID);
		if (allDevices.length)
		{
		    checkUSB = 'false';
			setup_spacenav(); 
		}
	}
	if (!spacenav || !spacenav.hid) setup_spacenav(); 
}, 1000);
