"use strict";

var RoonApi = require("node-roon-api"),
    RoonApiSettings  = require('node-roon-api-settings'),
    RoonApiStatus    = require('node-roon-api-status'),
    RoonApiTransport = require('node-roon-api-transport');

var HID = require('node-hid');
var util = require('util');
var events = require('events');

var allDevices;
var core;
var playingstate = '';

var roon = new RoonApi({
    extension_id:        'de.angisoft.roonspacenav',
    display_name:        "Space Navigator Volume Control",
    display_version:     "1.0.0",
    publisher:           'Klaus Engel',
    log_level: 			 "none", 
    email:               'klaus.engel@gmail.com',
    website:             'https://www.angisoft.de',

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
	    }
	});
    },
    core_unpaired: function(core_) {
	core = undefined;
    }
});

var mysettings = Object.assign({
    zone:             null,
    sensitivity: 20
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

    if (settings.longpressaction != "none") {
	let v = {
	    type:    "integer",
	    min:     1,
	    max:     100,
	    title:   "Sensitivity",
	    setting: "sensitivity"
	};
	if (settings.sensitivity < v.min || settings.sensitivity > v.max) {
	    v.error = "Sensitivity must be between 1 and 100.";
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

function update_status() {
    if (spacenav.hid)
		svc_status.set_status("Connected to 1 USB device.", false);
    else
		svc_status.set_status("Could not find USB device.", true)
}

roon.start_discovery();
setInterval(() => { if (!spacenav.hid) setup_spacenav(); }, 1000);

function getAllDevices()
{
    if (!allDevices) {
        allDevices = HID.devices(1133, 50726);
    }
    return allDevices;
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
        throw new Error("No SpaceNavigator could be found");
    }
    if (index > spaceNavs.length || index < 0) {
        throw new Error("Index " + index + " out of range, only " + spaceNavs.length + " SpaceNavigators found");
    }

    if (this.hid) {
        this.hid.close();
		this.hid = undefined;
    }

    try {
	    this.hid = new HID.HID(spaceNavs[index].path);
    	//this.hid.write([0x04, 0x01]);
    	this.hid.on('data', this.interpretData.bind(this));
    } catch (e) {}
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
   if (data[0] === 3)
    {
       	try {
        	if (data[1] == 2)
        		core.services.RoonApiTransport.control(mysettings.zone, 'next');
	    	if (data[1] == 1)
        		core.services.RoonApiTransport.control(mysettings.zone, 'previous');

      	} catch (e) {}
      	return;
    }
   var transform = parseData.apply(parseData, data.slice(1));
    if (data[0] === 1)
    {
    	this.emit('translate', transform);
    }
    if (data[0] === 2)
    {
    	this.emit('rotate', transform);
    }
 };

var spacenav;
function setup_spacenav() {
	spacenav = new SpaceNavigator();
	spacenav.on('translate', (translation) => {
	//    console.log('translate: ', JSON.stringify(translation));
	//    try {
	//	    if (translation.y != 0.)
	//    		core.services.RoonApiTransport.seek(mysettings.zone, 'relative', -1 * translation.y);
	// 	} catch (e) {}
	});

	spacenav.on('rotate', (rotation) => {
	//    console.log('rotate: ', JSON.stringify(rotation));
	//    console.log(JSON.stringify(rotation.y));

	     if (!core) return;

	    try {
		    if (rotation.y != 0.)
	    		core.services.RoonApiTransport.change_volume(mysettings.zone, 'relative_step', -1 * rotation.y * mysettings.sensitivity/20.);
	 	} catch (e) {}
	});
	update_status();
	update_led();
}

setup_spacenav();
update_status();