//w2api - Version 0.0.2
Array.prototype.find = function(...args) { 
	let index = this.findIndex(...args);
	if (index >= 0) return index >= 0 ? this[index] : void 0 ;
}

//global.openWA = require('@adiwajshing/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const {
  default: makeWASocket,
  useSingleFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay
}  = require('@adiwajshing/baileys');

//global.baileysWA = null;

/*
 MessageType,
  Presence,
  Mimetype,
  GroupSettingChange,
  MessageOptions,
  WAMessageKey,
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
  version*/


const fs = require('fs');
const async = require("async");
const request = require('request');
const moment = require('moment');
const mime = require('mime-types');
//const { decryptMedia } = require('@open-wa/wa-decrypt');
//const QR = require('qrcode-base64');
const { default: PQueue } = require("p-queue");
const crypto = require('crypto');
const queue = new PQueue({timeout: 30000, throwOnTimeout: false });

global.WA_CONFIG_ENV = process.cwd() + '/whatsSessions/config.env';
global.WA_CONFIG_SESSION = process.cwd() + '/whatsSessions/1.data.json';


//get config env
require('dotenv').config({ path: WA_CONFIG_ENV });

global.uaOverride = 'WhatsApp/2.22.5.72 Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15';
global.WA_CLIENT = {};
global.WA_SOCKET = null;
global.WA_BATTERY = 100;
/*
* Enviroment Values
*/
global.WA_INSTANCE = (F.config['instance'] ? F.config['instance'].toString() : "1") ;
global.WA_VERSION = (F.config['waversion'] ? eval(F.config['waversion']) : [2, 2206, 9]) ;
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
    //regenerateQRIntervalMs: 15_000,
    //maxIdleTimeMs: 45_000,
    //waitOnlyForLastMessage: false,
    //waitForChats: true,
    //maxRetries: Infinity,
    //connectCooldownMs: 3_000,
    //phoneResponseTime: 10_000,
    //alwaysUseTakeover: true,
    //auth: state,
    fetchAgent: uaOverride,
    browser: ['Mac OS', 'Safari', '10.15.3'],
    printQRInTerminal: true
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
		    id: WA_CLIENT.SETMSGID(data.key),
        chatId: WA_CLIENT.CONVERTOLDUID(data.key.remoteJid),        
        status: (data.status == 2 ? 'sent' : (data.status == 3 ? 'delivered' : 'viewed'))
      }],
      instanceId: instanceID
  });
};

/*
  Need to do work over diffrent kind of messageType 

    buttonsMessage:'buttonsMessage'*
    contactsArray:'contactsArrayMessage'*
    extendedText:'extendedTextMessage'*
    groupInviteMessage:'groupInviteMessage'*
    listMessage:'listMessage'*
    liveLocation:'liveLocationMessage'*
    product:'productMessage'*
*/
var MESSAGE_TYPE = function(messageType, msg) {
  //const messageType = Object.keys (msg.message)[0];
  //const messageMedia = msg.message[messageType];

  if(messageType == MessageType.text || messageType == MessageType.extendedText)
    return 'chat'

  if(messageType.toString() === 'buttonsResponseMessage' || messageType == MessageType.buttonsMessage) 
    return 'buttons_response'

  if(messageType == MessageType.image)
    return 'image';
  
  if(messageType == MessageType.document)
    return 'document';
  
  if(messageType == MessageType.video)
    return 'video';

  if(messageType == MessageType.location || messageType == MessageType.liveLocation)
    return 'location';

  if(messageType == MessageType.contact)
    return 'vcard';

  if(messageType == MessageType.sticker)
    return 'sticker';
  
  if(messageType == MessageType.audio)
    return msg.message[messageType].ptt == true ? 'ptt' : 'audio';

  console.log("new format:" + messageType.toString());
  console.log(msg);

  return messageType.toString();
}

var CONTACT_INFO = async function(client, remoteJid, groupJid = null) {

      if(client){
        //console.log(client.contacts);
        let u;
        
        if(client.contacts[remoteJid]) {          
          u = {
            formattedName: client.contacts[remoteJid].name,
            pushName: client.contacts[remoteJid].notify,
            profilePic: undefined,
            shortName: client.contacts[remoteJid].short,
            from: WA_CLIENT.CONVERTOLDUID(client.contacts[remoteJid].jid)
          }  
          
          const uPic = await client.getProfilePicture(remoteJid).then( p => {
              u.profilePic = p;
          });
        }

        //group info work after
        /*
        if(groupJid != null) {
          const response = await client.query({ json: ["query","GroupMetadata",groupJid] })
          .then(data => data.participants.map(a => {
            console.log(a);
          }));
          /*if(u && response) {
            u.isAdmin = response.participants[u.from].isAdmin; 
            u.isSuperAdmin= response.participants[u.from].isSuperAdmin;
          }
          //const i = await client.groupMetadata(remoteJid).then(data => {
          console.log(response.participants);*/
         // });
          
       // }

        return u;

        
      }

}

var LOCATION_INFO = async function(mType, messageMedia, messageType) {
  //const mType = MESSAGE_TYPE(msg);

  let loc = {
    lat: undefined,
    lng: undefined,
    isLive: undefined,
    loc: undefined,
    caption: undefined
  };

  if(mType != 'location')
    return loc;

  //const messageType = Object.keys (msg.message)[0];
  //const messageMedia = msg.message[messageType];

  loc.lat = messageMedia.degreesLatitude;
  loc.lng = messageMedia.degreesLongitude;
  loc.caption = (messageMedia.caption ? messageMedia.caption : undefined);
  loc.isLive = (messageType == MessageType.liveLocation);
  loc.loc = (messageMedia.address && messageMedia.name ? (messageMedia.name != messageMedia.address ? `${messageMedia.name}\r\n${messageMedia.address}` : `${messageMedia.address}`) : undefined);
  
  if(loc.loc == '')
    loc.loc = undefined;

  return loc;
}

var BODY_WA = async function(mType, m, messageType) {

  let b;

  if(!(mType == 'chat' || mType == 'vcard' || mType == 'buttons_response'))
    return b;

  if(mType != 'buttons_response')
    b = (m.message.conversation ? m.message.conversation : ( messageType == MessageType.extendedText && m.message.extendedTextMessage.text ? m.message.extendedTextMessage.text : ( messageType == MessageType.contact ? m.message.contactMessage.vcard : null)));
  else
    b = m.message.buttonsResponseMessage.selectedDisplayText;

  return b;
}

var DOWNLOAD_MEDIA = async function(mType, msg, client) {

      //const mType = MESSAGE_TYPE(msg);

      let download = {
        mimetype: undefined,
        title: undefined,
        fileName: undefined,
        filelink: undefined,
        fileb64: undefined,
        thumbnail: undefined,
        thumbb64: undefined,
        caption: undefined
      };

      if(!(mType == 'image' || mType == 'document' ||  mType == 'location' || mType == 'video' || mType == 'stciker' || mType == 'audio' || mType == 'ptt'))
        return download;

      const messageType = Object.keys (msg.message)[0];
      const messageMedia = msg.message[messageType];
      const rname = crypto.randomBytes(Math.ceil(20 / 2)).toString('hex').slice(0, 20);

      download.mimetype = (messageMedia.mimetype ? messageMedia.mimetype : undefined);
      download.title = (messageMedia.title ? messageMedia.title  : undefined);
      download.fileName = (messageMedia.fileName ? messageMedia.fileName  : undefined);
      download.caption = (messageMedia.caption ? messageMedia.caption  : undefined);
      
      // repair mimetype incorrect
      if(messageMedia.mimetype == 'image/jpeg' && messageMedia.title && messageMedia.fileName)
        messageMedia.mimetype = 'application/octet-stream';      

      if(messageMedia.mimetype) {
        const messageObj =  {      
                                mimetype: messageMedia.mimetype,
                                filehash: messageMedia.fileSha256,
                                mediaKey: messageMedia.mediaKey,
                                type: mType,
                                size: messageMedia.fileLength,
                                clientUrl: messageMedia.url,
                                jpegthumbnail: messageMedia.jpegThumbnail
                            };

        const mediaData = await client.downloadMediaMessage(msg).then(buffer => {

          if(download.fileName && (mime.extension(messageMedia.mimetype).toString() == 'false' || mime.extension(messageMedia.mimetype).toString() == 'bin')) {
            if (download.fileName.indexOf('.') > -1)
              download.filelink = `${rname}.${download.fileName.split('.').pop()}`;	
            else
               download.filelink = `${rname}`;
          } else {
            download.filelink = `${rname}.${mime.extension(messageMedia.mimetype)}`;	
          }
          
          //save file in disk
          fs.writeFile(process.cwd() + '/public/cdn/' + download.filelink, buffer, function(err) {
            if (err) {
              return console.log(err);
            }
          });

          //return base 64
          if(!WA_DISABLEB64) {
            download.fileb64 = `data:${messageMedia.mimetype};base64,${buffer.toString(
              'base64'
            )}`;
          }

        });

        /* const mediaData = await decryptMedia(messageObj).then(buffer => { 

          if(download.fileName && (mime.extension(messageMedia.mimetype).toString() == 'false' || mime.extension(messageMedia.mimetype).toString() == 'bin')) {
            if (download.fileName.indexOf('.') > -1)
              download.filelink = `${rname}.${download.fileName.split('.').pop()}`;	
            else
               download.filelink = `${rname}`;
          } else {
            download.filelink = `${rname}.${mime.extension(messageMedia.mimetype)}`;	
          }
          
          //save file in disk
          fs.writeFile(process.cwd() + '/public/cdn/' + download.filelink, buffer, function(err) {
            if (err) {
              return console.log(err);
            }
          });

          //return base 64
          if(!WA_DISABLEB64) {
            download.fileb64 = `data:${messageMedia.mimetype};base64,${buffer.toString(
              'base64'
            )}`;
          }

        }); */

      } 
     
      if(messageMedia.jpegThumbnail) {
        if(Buffer.byteLength(messageMedia.jpegThumbnail) > 0) {
            download.thumbnail = `${rname}_thum.jpg`;

            fs.writeFile(process.cwd() + '/public/cdn/' + download.thumbnail, messageMedia.jpegThumbnail, function(err) {
              if (err) {
                return console.log(err);
              }
            });

            //return base 64
            if(!WA_DISABLEB64) {
              download.thumbb64 = `data:image/jpeg;base64,${messageMedia.jpegThumbnail.toString(
                'base64'
              )}`;
            }
        }
      }

      return download;
}

/*
  Get version WA
*/
var GET_WA_VERSION = function() {
  
  var getWA = async function() {							
		const { version, isLatest } = await fetchLatestBaileysVersion();
    
    WA_VERSION = version;

    console.log({
      version: version,
      isLatest: isLatest
    });
  }						
  getWA();
}

/*
* Sanitizing the type of message response i want on webhook POST request
* you can edit this method but pay attention to documentation.
*/
var SANITIZE_MSG = function(instanceID, data) {

  if(DEBUG)
	  console.log(data);

  // download media  
  //console.log( WA_CLIENT.CONVERTOLDUID(WA_CLIENT.CONNECTION.user.jid));
  //console.log(MESSAGE_TYPE(data));
  //return;

  let fromName = (data.sender.pushName ? data.sender.pushName : (data.sender.formattedName ? data.sender.formattedName : (data.sender.shortName ? data.sender.shortName : data.author.split('@')[0])));
  let cBody = (data.body ? data.body : (WA_DISABLEB64 ? (data.body ? data.body : '') : data.media.fileb64));
  return JSON.stringify({
    messages: [{ 
      id: data.id,
      body: cBody,
      filelink: data.media.filelink,
      thumb: data.media.thumbnail,
      mimetype: data.media.mimetype,
      fromMe: data.key.fromMe,
      me: data.me,
      self: 0,
      isForwarded: data.isForwarded,
      forwardingScore: data.forwardingScore,
      author: (data.isGroupMsg ? data.author : data.from),
      time: data.messageTimestamp.low,
      lat: data.location.lat, 
      lng: data.location.lng, 
      locIslive:  (data.location.lng ? (data.location.isLive ? data.location.isLive : false) : data.location.isLive), 
      loc: data.location.loc, 
      chatId: data.from,
      type: data.type,      
      senderName: fromName,
	    senderPic: data.sender.profilePic,
      caption: (data.media.caption ? data.media.caption : (data.location.caption ? data.location.caption : (data.media.title ? data.media.title : null))), 
      quotedMsgBody: (data.quotedMsgBody ? data.quotedMsgBody : null),
      quotedMsgId: (data.quotedMsgId ? data.quotedMsgId : null),
      chatName: (data.isGroupMsg ? data.chat.formattedName : fromName)
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
		SANITIZED = SANITIZE_MSG(that.INSTANCE, data);
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
    CLIENT.on ('chat-update', chat => {
      if (!chat.messages) return   

      const { messages } = chat;
      const msg = messages.all()[0];

      //console.log(chat);
      
      //ack message
      if(msg.key.fromMe === true && (msg.status || msg.status == 0)){

        if(msg.status == 0 || msg.key.remoteJid === CLIENT.user.jid) return;

        queue.add(async (m = msg, o = CLIENT) => { 
          that.PROCESS_ACK(msg);
        });

        
      } 
      else 
      {

        //post message
        queue.add(async (m = msg, o = CLIENT) => { 

            const messageType = Object.keys (m.message)[0];
            const message = m.message[messageType];
            
            //Me
            m.id = WA_CLIENT.SETMSGID(m.key);
            m.me = WA_CLIENT.CONVERTOLDUID(o.user.jid);
            m.from = WA_CLIENT.CONVERTOLDUID(m.key.remoteJid);
            m.author = (m.participant ? WA_CLIENT.CONVERTOLDUID(m.participant) : WA_CLIENT.CONVERTOLDUID(m.key.remoteJid));
            m.type = MESSAGE_TYPE(messageType, m);
            m.isGroupMsg = (m.participant ? true : false );

            //forward
            if(message.contextInfo){
             // console.log(message.contextInfo);
              
              if(message.contextInfo.isForwarded) {
                m.isForwarded = message.contextInfo.isForwarded;
                m.forwardingScore = message.contextInfo.forwardingScore;
              } else {
                const messageTypeQ = Object.keys (message.contextInfo.quotedMessage)[0];
                const mQ = {message: message.contextInfo.quotedMessage};
                const mQType = MESSAGE_TYPE(messageTypeQ, mQ);
                m.mentionedJid = message.contextInfo.mentionedJid;
                m.quotedMsgId = WA_CLIENT.SETMSGID({ id: message.contextInfo.stanzaId, remoteJid: message.contextInfo.participant, fromMe: (message.contextInfo.participant === m.me)});
               
                if(mQType == 'chat') {
                  m.quotedMsgBody = {
                    body: await BODY_WA(mQType, mQ, messageTypeQ) 
                  };
                } else if (mQType == 'buttons_response') {
                  m.quotedMsgBody = { buttonId: m.message.buttonsResponseMessage.selectedButtonId };
                } else {
                  m.quotedMsgBody = { body: mQType };
                }

              }
              
            }

            //get media info 
            m.media = await DOWNLOAD_MEDIA(m.type, m, o);

            //body
            m.body = await BODY_WA(m.type, m, messageType);
            
            //get chat info            
            m.chat = await CONTACT_INFO(o, m.key.remoteJid);

            //get sender info 
            m.sender = await CONTACT_INFO(o, (m.participant ? m.participant : m.key.remoteJid), (m.isGroupMsg ? m.key.remoteJid : null));   

            //get loc info
            m.location = await LOCATION_INFO(m.type, message, messageType);

            that.PROCESS_MESSAGE(m);

        });     
      }
    });

    /** when the connection to the phone changes */
    CLIENT.on('connection-phone-change', state => {
      //console.log("connection-phone-change");
      //console.log("Connection State:" + state);
      that.PROCESS_STATE(state);
    });

    /** when a contact is updated */
    CLIENT.on('contact-update', update => {      
      console.log("contact-update")
      console.log(update);
    });

    CLIENT.on ('CB:action,,battery', json => {
      const batteryLevelStr = json[2][0][1].value
      const batterylevel = parseInt (batteryLevelStr)
      //console.log ("battery level: " + batterylevel + "%")
      WA_BATTERY = batterylevel;
  });
    
    /** when contacts are sent by WA */
    /*CLIENT.on('contacts-received', u => {
      console.log("contacts-received")
      console.log(u);
    });*/

};

WHATS_API.prototype.CONVERTOLDUID = function(id){

  var that = this;
  if(!id) return;

  if(id.indexOf('-') !== -1)
    return id.replace(new RegExp('s.whatsapp.net', 'g'), 'g.us');
  else
    return id.replace(new RegExp('s.whatsapp.net', 'g'), 'c.us');

}

WHATS_API.prototype.CONVERTNEWUID = function(id){

  var that = this;
  if(!id) return id;

  if(id.indexOf('c.us') !== -1)
    return id.replace(new RegExp('c.us', 'g'), 's.whatsapp.net');

}

WHATS_API.prototype.DELAY = function(ms) {
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < ms);
}

WHATS_API.prototype.SETMSGID = function(messageKey) {
  if(messageKey || messageKey.fromMe || messageKey.remoteJid || messageKey.id) {
    return `${messageKey.fromMe}_${messageKey.remoteJid}_${messageKey.id}`;
  } 

    throw "Object key invalid or not exist";
    return;
  
};

WHATS_API.prototype.GETMSGKEY = function(msgid) {
  try {
        if(msgid.indexOf('_') > -1) {
          let k = msgid.split("_");
          return {             
                remoteJid: k[1],
                fromMe: (k[0] === 'true'),
                id: k[2]                 
            };
        }
  } catch(e) {
    throw "Object key invalid or not exist";
  }
    return;
}

WHATS_API.prototype.GETMESSAGEBYID = async function(client, msgid) {

  let msg;

  if(client && msgid) {
    const msgkey = WA_CLIENT.GETMSGKEY(msgid);
    //console.log(msgkey); 
    const msgInfo = await client.loadMessages(msgkey.remoteJid, 1, {fromMe: msgkey.fromMe, id: msgkey.id}, true).then( m => {
      //console.log(m);
      if(m.cursor != null && m.messages.length > 0)
        msg = m.messages[0];
    }).catch( e => {
      return;
    });
  }

  return msg;
}

WHATS_API.prototype.SET_QRCODE = function(code){
  var that = this;
  if(qrCodeManager){
    qrCodeManager.send({ qr: code });
  };

  that.QR_CODE = code;
};

WHATS_API.prototype.KILL = function() {
  var that = this;

  //baileysWA.close();
  //baileysWA = null;
}

WHATS_API.prototype.CONNECT = function() {

  var that = this;
  //baileysWA = null;

  var connectWA = async function() {   

    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    WA_VERSION = version;

    console.log({
      version: version,
      isLatest: isLatest
    });

    await delay(500);

    //restore session WA
    const {state, saveState} = useSingleFileAuthState(WA_CONFIG_SESSION);

    //set config parameters
    WA_CONFIG.auth = state;
    WA_CONFIG.version = WA_VERSION;
    //level log
    WA_CONFIG.logger = (DEBUG) ? P({ level: "debug" }) : P({ level: 'info' });

    //start service
    const sock = makeWASocket(WA_CONFIG);

    //handle: connection update
    sock.ev.on('connection.update', async u => {

            const { connection, lastDisconnect, qr } = u;

            let qrNotification = (connected, message) => {
              //send message if QR Code process
              if(qrCodeManager){
                qrCodeManager.send({ connected: connected,
                                    message: message
                });
              }

              //if have socket send
              if(WA_SOCKET) {
                WA_SOCKET.send({ connected: connected,
                              message: message
                });
              }            
            }

            //console.log('LogErrorSC', lastDisconnect);
        
            if(connection === 'close') {

              let reconnectObj = {
                reconnect: false,
                reson: undefined,
                delay: 0
              }

              const {errno, isBoom, data} = lastDisconnect.error;

              //device removed, so delete session file
              try {
                if(data.content[0].attrs.type == 'device_removed'){
                  fs.unlinkSync(WA_CONFIG_SESSION);

                  //reconnect
                  reconnectObj.reconnect = true;
                  reconnectObj.reson = 'Device Removed';
                  reconnectObj.delay = 10000;
                }
              } catch(e) {
                //none
              }               

              //fail internet connection
              if(errno == -3008) {
                //reconnect
                reconnectObj.reconnect = true;
                reconnectObj.reson = 'Fail connection with Internet';
                reconnectObj.delay = 30000;
              }
                
              if(isBoom) {

                if (lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut || lastDisconnect.error.output.payload.message == 'Connection Failure') {
                  //reconnect
                  reconnectObj.reconnect = true;
                  reconnectObj.reson = lastDisconnect.error.output.payload.message;
                  reconnectObj.delay = 5000;
                } 

                //notify about fail over connection
                qrNotification(false, lastDisconnect.error.output.payload.message);
                
              }

              if(reconnectObj.reconnect) {

                  console.log('connection closed due to ', reconnectObj.reson ,', reconnecting ', reconnectObj.reconnect);

                  if(reconnectObj.delay > 0)
                    await delay(reconnectObj.delay);

                  connectWA();
              }

            } else if(connection === 'open') {
                console.log('opened connection');

                //if QRCode inform success
                qrNotification(true, undefined);

                //start service
                //WA_CLIENT.SETUP(sock, WA_WEBHOOK, WA_TOKENKEY);

            } else if (connection == 'connecting') {
              console.log(connection + '...');              
            }
            
            //Send QRCODE
            if(qr) {
              console.log('SCAN THE ABOVE QR CODE TO LOGIN!');
        
              const b64 = require('qrcode-base64').drawImg(qr, {
                typeNumber: 4,
                errorCorrectLevel: 'M',
                size: 250
              });
        
              //console.log(b64);
              WA_CLIENT.SET_QRCODE(b64);
            }
  
    });

    //handle: Save State
    sock.ev.on('creds.update', saveState);
  }
  
  // strat Baileys
  connectWA();
}

module.exports = WHATS_API;

ON('ready', function(){
  WA_CLIENT = new WHATS_API(WA_INSTANCE);
  WA_CLIENT.CONNECT();  
});
