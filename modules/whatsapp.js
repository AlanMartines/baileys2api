//w2api - Version 0.0.2
Array.prototype.find = function(...args) { 
	let index = this.findIndex(...args);
	if (index >= 0) return index >= 0 ? this[index] : void 0 ;
}

//global.openWA = require('@adiwajshing/baileys');
const {
  WAConnection,
  MessageType,
  Presence,
  Mimetype,
  GroupSettingChange,
  MessageOptions,
  WALocationMessage,
  WA_MESSAGE_STUB_TYPES,
  KEEP_ALIVE_INTERVAL_MS,
  ReconnectMode,
  ProxyAgent,
  waChatKey,
  mentionedJid,
  processTime,
  delay,
  browserDescription,
  version
} = require('@adiwajshing/baileys');
global.baileysWA = null;


const fs = require('fs');
const async = require("async");
const request = require('request');
const moment = require('moment');
const mime = require('mime-types');
const { default: PQueue } = require("p-queue");
const crypto = require('crypto');
const queue = new PQueue({timeout: 30000, throwOnTimeout: false });

global.WA_CONFIG_ENV = process.cwd() + '/whatsSessions/config.env';
global.WA_CONFIG_SESSION = process.cwd() + '/whatsSessions/1.data.json';

//get config env
require('dotenv').config({ path: WA_CONFIG_ENV });

global.uaOverride = 'WhatsApp/2.16.352 Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Safari/605.1.15';
global.WA_CLIENT = {};
global.WA_SOCKET = null;
/*
* Enviroment Values
*/
global.WA_INSTANCE = (F.config['instance'] ? F.config['instance'].toString() : "1") ;
global.WA_LICENCEKEY = "";
global.WA_MASTERKEY = "";
global.WA_TOKENKEY = "";
global.WA_WEBHOOK = "";
global.WA_ISDOCKER = false;
global.WA_DISABLEB64 = false;

//if instance equal 1 operate with enviroment variable
if( WA_INSTANCE == "1") {
  WA_LICENCEKEY = (process.env.WA_LICENCEKEY ? process.env.WA_LICENCEKEY : "");
  WA_MASTERKEY = (process.env.WA_MASTERKEY ? process.env.WA_MASTERKEY : "");
  WA_TOKENKEY = (process.env.WA_MASTERKEY ? process.env.WA_MASTERKEY : "");
  WA_WEBHOOK = (process.env.WA_WEBHOOK ? process.env.WA_WEBHOOK : "http://127.0.0.1/");
  WA_ISDOCKER = true;
  WA_DISABLEB64 = true;
} else {
  WA_LICENCEKEY = (F.config["licensekey"] ? F.config["licensekey"] : "");
  WA_MASTERKEY = (F.config["masterKey"] ? F.config["masterKey"] : "");
  WA_TOKENKEY = (F.config["token"] ? F.config["token"] : "");
  WA_WEBHOOK = (F.config["webhook"] ? F.config["webhook"] : "http://127.0.0.1/");
  if(F.config["disableb64"] == true)
    WA_DISABLEB64 = true;
}

global.WA_CONFIG = {
  regenerateQRIntervalMs: 15_000,
  maxIdleTimeMs: 45_000,
  waitOnlyForLastMessage: false,
  waitForChats: true,
  maxRetries: Infinity,
  connectCooldownMs: 3_000,
  phoneResponseTime: 10_000,
  alwaysUseTakeover: true,
  fetchAgent: uaOverride
  };

/*
* Function to read files as base64 string
*/
function base64Encode(file) {
  var body = fs.readFileSync(file);
  return body.toString('base64');
};

/*
* has socket someone oline
*/
function hasSocket(){
  if(WA_SOCKET) {
    if(WA_SOCKET.online > 0){
      return true;
    }
  }
  return false;
}


/*
* WhatsApp API SUPER CLASS
* Personal regards to:
* Mohhamed Shah (openWA) - 
* Peter Sírka (TotalJS) - 
* This library was built using openWA and pieces of 
*/
function WHATS_API(USER_ID) {
  console.log("\n====================================================");
  console.log("@@Creating WhatsApp connection for: "+USER_ID);
  console.log("====================================================\n");
  this.QR_CODE = "";
  this.WEBHOOK = "";
  this.TOKEN = "";
  this.INSTANCE = USER_ID;
  this.CONNECTION = {};
};

/*
* Sanitizing the type of ack response i want on webhook POST request
* you can edit this method but pay attention to documentation.
* ACK EVENTS:
* 1 - send 
* 2 - delivered
* 3 - viewed
* 4 - listened
*/
var SANITIZE_ACK = function(instanceID,data){
	//console.log(data);
  return JSON.stringify({
      ack: [{
        //id: data.id._serialized,
		    id: data.id,
        chatId: data.id.remote,
        status: (data.ack == 1 ? 'sent' : (data.ack == 2 ? 'delivered' : 'viewed'))
      }],
      instanceId: instanceID
  });
};

/*
* Sanitizing the type of message response i want on webhook POST request
* you can edit this method but pay attention to documentation.
*/
var SANITIZE_MSG = function(instanceID,data) {

  if(DEBUG)
	  console.log(data);

  let fromName = (data.sender.pushname ? data.sender.pushname : (data.sender.formattedName ? data.sender.formattedName : (data.sender.shortName ? data.sender.shortName : data.from.split('@')[0])));
  return JSON.stringify({
    messages: [{ 
      id: data.id,
      body: data.body,
      filelink: data.filelink,
      mimetype: data.mimetype,
      fromMe: false,
      me: data.to,
      self: 0,
      isForwarded: data.isForwarded,
      author: (data.isGroupMsg ? data.author : data.from),
      time: data.t,
      lat: data.lat,
      lng: data.lng,
      locIslive:  (data.lng ? (data.isLive ? data.isLive : false) : data.isLive),
      loc: (data.loc ? data.loc : (data.comment ? data.comment : data.loc)),
      chatId: data.chat.id,
      type: data.type,      
      senderName: fromName,
	    senderPic: data.sender.profilePicThumbObj.eurl,
      caption: (data.caption ? data.caption : null),
      quotedMsgBody: (data.quotedMsgObj ? data.quotedMsgObj : null),	  
      chatName: (data.isGroupMsg ? data.chat.contact.name : fromName)
    }],
    instanceId: instanceID
  });
};

/*
* Creating an prototype of messages to send information and control flow over webhook
* you can edit this method but pay attention to documentation.
*/
WHATS_API.prototype.PROCESS_MESSAGE = function(data){
  var that = this;
  var SANITIZED = null;

   try {      
		SANITIZED = SANITIZE_MSG(that.INSTANCE,data);
    } catch(e) {
      if (DEBUG)
        console.log(e);    
    }

    // send websocket if avaible
  if(hasSocket()) {
    try {
      WA_SOCKET.send(SANITIZED);

      if (DEBUG)
        console.log(SANITIZED);

      return;

    } catch(e) {
      console.log(e);
    }
  } 

      //send post 
      request({
        method: 'POST',
        url:  that.WEBHOOK,
        headers: { 'Content-Type': 'application/json' },
        body: SANITIZED
      }, function(err, response, body){
        if(err){
          ERROR_CATCHER(err);
        } else {
          if(response.statusCode != 200){
            ERROR_CATCHER("Status Code error: "+response.statusCode,response);
          } else {
            if (DEBUG)
              console.log(SANITIZED);
          }
        }
      });

  
};

/*
* Creating an prototype of ack events to send information and control flow over webhook
* you can edit this method but pay attention to documentation.
*/
WHATS_API.prototype.PROCESS_ACK = function(data){
  var that = this;
  var SANITIZED = SANITIZE_ACK(that.INSTANCE,data);

  if(hasSocket()) {

    try{

      WA_SOCKET.send(SANITIZED);
      
      if (DEBUG)
        console.log(SANITIZED);

      return;

    } catch(e) {
      console.log(e);
    }

  } 

      //send post
      request({
        method: 'POST',
        url:  that.WEBHOOK,
        headers: { 'Content-Type': 'application/json' },
        body: SANITIZED
      }, function(err, response, body){
        if(err){
          ERROR_CATCHER(err);
        } else {
          if(response.statusCode != 200){
            ERROR_CATCHER("Status Code WRONG: "+response.statusCode,response);
          } else {
            if (DEBUG)
              console.log(SANITIZED);
          }
        }
      });

  
};

/*
* to-do - Creating webhook events to inform when something goes wrong with API
* if you have any knowleadge about it - help me to improve
*/
WHATS_API.prototype.PROCESS_STATE = function(data){
  if (DEBUG)
	  console.log("[STATE CHANGED] -",data);
};

/*
* Prototype configuration for setup events incoming from openWA module
* keep your hands away from this
*/
WHATS_API.prototype.SETUP = function(CLIENT,WEBHOOK_INPUT,TOKEN_INPUT) {
  
  var that = this;
  that.WEBHOOK = WEBHOOK_INPUT;
  that.TOKEN = TOKEN_INPUT;
  that.CONNECTION = CLIENT;

    /** when a chat is updated (new message, updated message, read message, deleted, pinned, presence updated etc) */
    CLIENT.on ('chat-update', async chat => {
      if (!chat.messages) return     

      queue.add(async (a = chat, o = CLIENT) => { 
        

        const { messages } = a;
        const m = messages.all()[0];
        console.log(m);
       /* MessageType,
        Presence,
        Mimetype */
        //const messageType = Object.keys (a.message)[0];
        //console.log(messageType);
        if(m.message.conversation || m.extendedTextMessage || m.contactMessage || m.locationMessage) {
          //text
          that.PROCESS_MESSAGE(m);
        } else {
          //media
          //console.log(o)
          //console.log(messages);
          const buffer = o.downloadMediaMessage({
            key: {
                remoteJid: m.key.remoteJid,
                id: m.key.id
            },
            message: m.message
        }) // to decrypt & use as a buffer        
          let rname = crypto.randomBytes(Math.ceil(20 / 2)).toString('hex').slice(0, 20);
          console.log(buffer);
          //let filename = `${rname}.${mime.extension(message.mimetype)}`;		
          //const savedFilename = await o.downloadAndSaveMediaMessage(a, process.cwd() + '/public/cdn/' + rname, true) // to decrypt & save to file
          //console.log(a.key.remoteJid + " sent media, saved at: " + savedFilename)
          //downloadAndSaveMediaMessage
          
        }
       });     
    });

    /** when the connection to the phone changes */
    CLIENT.on('connection-phone-change', state => {
      console.log("connection-phone-change")
      console.log("Connection State:" + state);
    });

    /** when a contact is updated */
    CLIENT.on('contact-update', update => {      
      console.log("contact-update")
      console.log(update);
    });
    
    /** when contacts are sent by WA */
    /*CLIENT.on('contacts-received', u => {
      console.log("contacts-received")
      console.log(u);
    });*/

  // CLIENT.onMessage(message => {
  //  queue.add(async () => {
     
  //     //CRECKING IF MESSAGE HAVE ANY MEDIA TYPE EMBED
  //     //console.log(message);
  //     if (message.mimetype) {
  //       //SAVING MEDIA RECEIVED AND EXPOSE ADDRESS TO WEB
  //       const mediaData = openWA.decryptMedia(message,uaOverride).then(function(DECRYPTED_DATA){
  //         let rname = crypto.randomBytes(Math.ceil(20 / 2)).toString('hex').slice(0, 20);
  //         var filename = `${rname}.${mime.extension(message.mimetype)}`;		
  //         fs.writeFile(process.cwd()+'/public/cdn/'+filename, Buffer.from(DECRYPTED_DATA, 'base64'), 'base64', function(err) {
  //           if(err){
  //             console.log("#Error on saving file");
  //             message['body'] = `data:${message.mimetype};base64,${message['body']}`;
  //             that.PROCESS_MESSAGE(message);           
  //           } else {
  //             if(!WA_DISABLEB64) {
  //               //if mode docker false, continue using old way
  //               message['filelink'] = filename;

  //               console.log()

  //               var r = fs.readFile(process.cwd() + '/public/cdn/' + filename, { encoding: 'base64' },  (e, data) => {
  //                 if(e) { 
  //                   console.log("#Error on saving file");
  //                   message['body'] = `data:${message.mimetype};base64,${message['body']}`;
  //                   that.PROCESS_MESSAGE(message);           
  //                 } else {
  //                   message['body'] = `data:${message.mimetype};base64,${data}`;
  //                   that.PROCESS_MESSAGE(message);

  //                     //no store file in server
  //                   fs.unlink(process.cwd()+'/public/cdn/'+ filename, function(err)  {
  //                     if (err) {
  //                       //console.error(err)				
  //                     } 
  //                   });  
  //                 }

  //               });              
                
                

  //           }  else {
  //               message['body'] = "";
  //               message['filelink'] = filename;
  //               that.PROCESS_MESSAGE(message);
  //           }      

  //           }
  //         });
      
  //       });	  
      
  //       /*if (DEBUG)
  //         console.log(imageBase64); */

  //     } else {
  //       that.PROCESS_MESSAGE(message);
  //     }

  //  })
  // });

  // CLIENT.onAck(ack => {
  //   that.PROCESS_ACK(ack);
  // });

  // CLIENT.onStateChanged(state => {
  //   that.PROCESS_STATE(state);
  // });

};

WHATS_API.prototype.SET_QRCODE = function(code){
  var that = this;
  if(qrCodeManager){
    qrCodeManager.send({ qr: code });
  };

  that.QR_CODE = code;
};

WHATS_API.prototype.KILL = function() {
  var that = this;
  baileysWA = null;
}

WHATS_API.prototype.CONNECT = function() {
  var that = this;

  baileysWA = new WAConnection();

  baileysWA.on ('open', result => {

    if (result.newConnection) {
      const authInfo = baileysWA.base64EncodedAuthInfo() // get all the auth info we need to restore this session
      fs.writeFileSync(WA_CONFIG_SESSION, JSON.stringify(authInfo, null, '\t')) // save this info to a file
    }

    //EXECUTING MODULE SETUP
    if(qrCodeManager){
      qrCodeManager.send({ connected: true });
    }

    //if have socket send
    if(WA_SOCKET)
      WA_SOCKET.send({ connected: true });
    
    WA_CLIENT.SETUP(baileysWA, WA_WEBHOOK, WA_TOKENKEY);

  });

  /*
  * Declare event getter for when qrcode is available from openWA-api
  */
  baileysWA.on('qr', qr => {
    console.log('SCAN THE ABOVE QR CODE TO LOGIN!');
    WA_CLIENT.SET_QRCODE(qr);
  });

  if (fs.existsSync(WA_CONFIG_SESSION)) {
    baileysWA.loadAuthInfo(WA_CONFIG_SESSION);
  }
 
  baileysWA.on('connecting', () => {console.log('Connecting...')});

  baileysWA.on('close', err => { 

    console.log(err); 

    //if session ivalid, delete file and restart
    if(err.reason == 'invalid_session') {
      try{
        fs.unlinkSync(WA_CONFIG_SESSION);
      } catch(e){
        //none
      }
    }

    // reboot service 
    if(!err.isReconnecting) {
      WA_CLIENT.KILL();
      delay(5000);
      WA_CLIENT.CONNECT();        
    }

  });

  baileysWA.connectOptions.alwaysUseTakeover = true;
  baileysWA.autoReconnect = ReconnectMode.onAllErrors;
  baileysWA.version = [2, 2140, 12];
  baileysWA.browserDescription = ['Mac OS', 'Chrome', '94.0.4606.104'];

  baileysWA.connect(WA_CONFIG);
}

module.exports = WHATS_API;

ON('ready', function(){

  /*
  * Create instance Baileys
  */
  WA_CLIENT = new WHATS_API(WA_INSTANCE);

  WA_CLIENT.CONNECT();  


});