//w2api - Version 0.0.2
Array.prototype.find = function(...args) { 
	let index = this.findIndex(...args);
	if (index >= 0) return index >= 0 ? this[index] : void 0 ;
}

const { Boom } = require('@hapi/boom');
const P = require('pino');
const { writeFile } = require('fs/promises');
const {
  default: makeWASocket,
  useSingleFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay,
  Browsers,
  isJidGroup,
  getContentType,
  downloadContentFromMessage,
  getMessageFromStore
}  = require('@adiwajshing/baileys');
const levelup = require('levelup');
const leveldown = require('leveldown');

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
const agents = require('user-agents');
const { Async } = require('total.js/utils');

global.WA_CONFIG_ENV = process.cwd() + '/whatsSessions/config.env';
global.WA_CONFIG_STORE = process.cwd() + '/whatsSessions/store.json';
global.WA_CONFIG_DB = process.cwd() + '/whatsSessions/store.db';
global.WA_CONFIG_SESSION = process.cwd() + '/whatsSessions/1.data.json';

//get config env
require('dotenv').config({ path: WA_CONFIG_ENV });
const userAgent = new agents({ deviceCategory: 'desktop' });
//console.log(userAgent.data.userAgent);

global.uaOverride = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.74 Safari/537.36' //userAgent.data.userAgent;
global.WA_CLIENT = {};
global.WA_STORE = null;
global.WA_DB = undefined;
global.WA_SOCKET = null;
global.WA_BATTERY = 100;
/*
* Enviroment Values
*/
global.WA_INSTANCE = (F.config['instance'] ? F.config['instance'].toString() : "1") ;
global.WA_VERSION = null;
global.WA_LICENCEKEY = "";
global.WA_MASTERKEY = "";
global.WA_TOKENKEY = "";
global.WA_WEBHOOK = "";
global.WA_ISDOCKER = false;
global.WA_DISABLEB64 = false;
global.WA_ISCONNECTED = false;

//if instance equal 1 operate with enviroment variable
if( WA_INSTANCE == "1") {
  WA_LICENCEKEY = (process.env.WA_LICENCEKEY ? process.env.WA_LICENCEKEY : "");
  WA_MASTERKEY = (process.env.WA_MASTERKEY ? process.env.WA_MASTERKEY : "");
  //to do: remove 
  WA_TOKENKEY = WA_MASTERKEY;
  WA_WEBHOOK = (process.env.WA_WEBHOOK ? process.env.WA_WEBHOOK : "http://127.0.0.1/");
  WA_ISDOCKER = true;
  WA_DISABLEB64 = true;
} else {
  WA_LICENCEKEY = (F.config["licensekey"] ? F.config["licensekey"] : "");
  WA_MASTERKEY = (F.config["masterKey"] ? F.config["masterKey"] : "");
  //to do: remove
  WA_TOKENKEY = WA_MASTERKEY;
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
    //fetchAgent: uaOverride,
    //browser: ['Mac OS', 'Safari', '10.15.3'],
    browser: Browsers.macOS('Safari'),
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
* Peter Sírka (TotalJS) - 
*/

var WA_STATE = {
  none: null,
  qrcode: 'qrcode',
  connected: 'connected',
  initiated: 'initiated'
}

function WHATS_API(USER_ID) {
  console.log("\n====================================================");
  console.log("@@Creating WhatsApp connection for: "+USER_ID);
  console.log("====================================================\n");
  this.QR_CODE = "";
  this.WEBHOOK = "";
  this.TOKEN = "";
  this.INSTANCE = USER_ID;
  this.CONNECTION = {};
  this.ME = {};
  this.STATE = WA_STATE.none;
};

WHATS_API.prototype.GET_STATE = () => {
  var that = this;
  return that.STATE;
} 

WHATS_API.prototype.SET_STATE = (s) => {
  var that = this;
  that.STATE = s;
} 

/* 
db manager 
*/
function WHATS_DB(config) {

  this.ISCONNECTED = false;
  this.DB = undefined;

  this.CONNECT = async function() {
    if(!this.ISCONNECTED) {
      this.DB = levelup(leveldown(config));
      this.ISCONNECTED = true;
    }
  }

  this.CLOSE = async function() {
    if(this.ISCONNECTED) {
      await this.DB.close(function (err){
        this.DB = undefined;
        this.ISCONNECTED = false;
      });  
    }
  }

}

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
        status: (data.status ? 'sent' : (data.update.status == 2 ? 'sent' : (data.update.status == 3 ? 'delivered' : 'viewed')))
      }],
      instanceId: instanceID
  });
};

/*
* Sanitizing the type of ack response i want on webhook POST request
* you can edit this method but pay attention to documentation.
*/
var SANITIZE_CALL = function(instanceID,data){
	//console.log(data);
  return JSON.stringify({
      call: [{
		    id: WA_CLIENT.SETMSGID(data.key),
        chatId: WA_CLIENT.CONVERTOLDUID(data.key.remoteJid),        
        reason: data.reason,
        type: 'call'
      }],
      instanceId: instanceID
  });
};

/*
* Sanitizing the type of ack response i want on webhook POST request
* you can edit this method but pay attention to documentation.
*/
var SANITIZE_QR = function(instanceID,data){
  return JSON.stringify({
      qr: [data],
      instanceId: instanceID
  });
};


var MESSAGE_TYPE = function(messageType, ptt = false) {

  //type message to ignore
  if(messageType == 'senderKeyDistributionMessage' || messageType == 'protocolMessage')
    return 'ignore'

  if(messageType == 'conversation' || messageType == 'extendedTextMessage')
    return 'chat';

  if(messageType == 'buttonsResponseMessage' || messageType == 'buttonsMessage') 
    return 'buttons_response';

  if(messageType == 'imageMessage')
    return 'image';

  if(messageType == 'documentMessage')
    return 'document';
  
  if(messageType == 'videoMessage')
    return 'video';

  if(messageType == 'locationMessage' || messageType == 'liveLocationMessage')
    return 'location';

  if(messageType == 'contactMessage')
    return 'vcard';

  if(messageType == 'stickerMessage')
    return 'sticker';
  
  if(messageType == 'audioMessage')
    return ptt ? 'ptt' : 'audio';
 
  console.log("new format:" + messageType.toString());

  return messageType.toString();
}

/*
* Sanitizing the type of message response i want on webhook POST request
* you can edit this method but pay attention to documentation.
*/
var SANITIZE_MSG = function(instanceID, data) {

  /*if(DEBUG)
	  console.log(data);*/

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
WHATS_API.prototype.PROCESS_MESSAGE = async function(data, type){
  var that = this;
  var SANITIZED = null;

  try {

    switch (type) {
      case 'message':
        SANITIZED = SANITIZE_MSG(that.INSTANCE, data);
        break;
      case 'ack':
        SANITIZED = SANITIZE_ACK(that.INSTANCE, data);
        break;
      case 'call':
        SANITIZED = SANITIZE_CALL(that.INSTANCE, data);
        break;
      case 'qr':
        SANITIZED = SANITIZE_QR(that.INSTANCE, data);
        break;
    }

    if (DEBUG && type != 'qr')
        console.log(SANITIZED);

  }
  catch(e) {
    if (DEBUG)
        console.log('Erro Sanitizer', e);   
  }

    // send websocket if avaible
  if(hasSocket()) {
    try {
      WA_SOCKET.send(SANITIZED);
      return;
    } catch(e) {
      console.log('Erro Sanitizer', e);
    }
  } 

  //send post 
  request({
    method: 'POST',
    url:  (that.WEBHOOK ? that.WEBHOOK : WA_WEBHOOK),
    headers: { 'Content-Type': 'application/json' },
    body: SANITIZED
  }, function(err, response, body){
    if(err){
      ERROR_CATCHER(err);
    } else {
      if(response.statusCode != 200){
        ERROR_CATCHER("Status Code error: "+response.statusCode,response);
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
  that.ME = {};
  that.CONTACT = null;
  
  if(that.CONNECTION) {

    //get info me

      that.ME = { 
        type: that.CONNECTION.type,
        jid: that.CONNECTION.user.id,
        id: WA_CLIENT.CONVERTOLDUID(that.CONNECTION.user.id),
        name: that.CONNECTION.user.name,
        profilePic: undefined,
        phone: WA_CLIENT.CONVERTOLDUID(that.CONNECTION.user.id).split('@')[0]
      }

      that.SET_STATE(WA_STATE.connected);

        //get image whatsapp
        const getMePicture = async () => { 
        
          try {

            await that.CONNECTION.profilePictureUrl(
                that.ME.jid,
              'image'
            ).then( p => {
              that.ME.profilePic = p;
              //console.log(p);
            });

          } catch(e) {
            //erro
            console.log('Erro get Picture', e);
          } finally {
            console.log(this.ME);
          }

        }

        getMePicture();
  }

  that.CONTACT = async function(customJid) {
    
    const jidinfo = undefined;

    if(!customJid) return;

    await WA_DB.DB.get(customJid, function(err, value) {
      if(!err) {
        jidinfo = JSON.parse(value);
      }          
    });

    return jidinfo;
    
  }

    //get jid info
    const JIDINFO = async function(jid, name = null, groupJid = null, isUpdate = false) {  

      //
      if(!jid || !that.CONNECTION)
        return;

      let jidinfo = {
          formattedName: undefined,
          pushName: undefined,
          profilePic: undefined,
          shortName: undefined,
          from: undefined,
          groupMetadata: undefined
      };    

      const customJid = WA_CLIENT.CONVERTOLDUID(jid);

      //check db
      if(!isUpdate) {

        await WA_DB.DB.get(customJid, function(err, value) {
          if(!err) {
            jidinfo = JSON.parse(value);
          }          
        });

        // if found data return
        if(jidinfo.from)
          return jidinfo;
      }
      
      jidinfo.from = customJid;

      const isGroup = isJidGroup(jid);
      
      if(isGroup && groupJid == null) {
        await that.CONNECTION.groupMetadata(jid).then( g => {
          jidinfo.formattedName = g.subject;
          jidinfo.pushName = g.subject;
          jidinfo.shortName = g.subject;  
          jidinfo.groupMetadata = g;
        }); 

      } 

      if(!isGroup || groupJid != null) {        
        jidinfo.formattedName = name;
        jidinfo.pushName = name;
        jidinfo.shortName = name;        
      }

      try {

       const a = await that.CONNECTION.profilePictureUrl(
          jid,
          'image'
        ).then( p => {
          jidinfo.profilePic = p;
        });

      } catch(e) {
        //erro
      }

      //recorder
      if(jidinfo) {
        try {
          await WA_DB.DB.put(customJid, JSON.stringify(jidinfo, undefined));
        } catch(e) {
          console.log('Fail when try store contact info', jidinfo, e)
        }
      }

      //clear info that not need to service
      jidinfo.groupMetadata = undefined;

      return jidinfo;
    }

    //get location info
    const LOCATIONINFO = async function(m) {

      const mType = getContentType(m.message);
      
      let loc = {
        lat: undefined,
        lng: undefined,
        isLive: undefined,
        loc: undefined,
        caption: undefined,
        jpegThumb: undefined
      };

      if(mType == 'locationMessage' || mType == 'liveLocationMessage') {

        const messageMedia = m.message[mType];

        loc.lat = messageMedia.degreesLatitude;
        loc.lng = messageMedia.degreesLongitude;
        loc.jpegThumb = messageMedia.jpegThumbnail;
        loc.caption = (messageMedia.caption ? messageMedia.caption : undefined);
        loc.isLive = (mType == 'liveLocationMessage');
        loc.loc = (messageMedia.address && messageMedia.name ? (messageMedia.name != messageMedia.address ? `${messageMedia.name}\r\n${messageMedia.address}` : `${messageMedia.address}`) : undefined);
        
        if(loc.loc == '')
          loc.loc = undefined;

      }

      return loc;
    }  

    //get body info
    const BODY = async function(m, contentType) {

      const mType = MESSAGE_TYPE(contentType);
      const message = m.message[contentType];

      if(!(mType == 'chat' || mType == 'vcard' || mType == 'buttons_response'))
        return;

        if(mType != 'buttons_response') {

          if(contentType == 'conversation')
              return message;
        
          //console.log(message);
          if(mType == 'chat' && message.text){
              return message.text;
          } else if(mType == 'vcard') {
            return message.vcard;
          }         
        }
        else
          return message.selectedDisplayText;
    }

    //get media info
    const DOWNLOADBIN = async function(m, mType, contentType) {

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

      const messageMedia = m.message[contentType];
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

        let dObj = null;

        switch (mType) {
          case 'image':
            dObj = (m.message.imageMessage || m.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage); 
            break;
          case 'video':
            dObj =  (m.message.videoMessage || m.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage);
            break;
          case 'sticker':
            dObj =  (m.message.stickerMessage || m.message.extendedTextMessage.contextInfo.quotedMessage.stickerMessage);
            break;
          case 'audio':
          case 'ptt':
            dObj =  (m.message.audioMessage || m.message.extendedTextMessage.contextInfo.quotedMessage.audioMessage);
            mType = 'audio';
            break;
          case 'document':
            dObj =  (m.message.documentMessage || m.message.extendedTextMessage.contextInfo.quotedMessage.documentMessage);
            break;
        }

        try {

          //start download
          const stream = await downloadContentFromMessage(dObj, mType);
          let buffer = Buffer.from([])
          for await(const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
          }

          //define file path
          if(download.fileName && (mime.extension(messageMedia.mimetype).toString() == 'false' || mime.extension(messageMedia.mimetype).toString() == 'bin')) {
            if (download.fileName.indexOf('.') > -1)
              download.filelink = `${rname}.${download.fileName.split('.').pop()}`;	
            else
              download.filelink = `${rname}`;
          } else {
            download.filelink = `${rname}.${mime.extension(messageMedia.mimetype)}`;	
          }

          const dPath = process.cwd() + '/public/cdn/' + download.filelink;

          // save to file
          await writeFile(dPath, buffer);

          //return base 64
          if(!WA_DISABLEB64)
            download.fileb64 = `data:${messageMedia.mimetype};base64,${buffer.toString(
              'base64'
            )}`;

        } catch(e) {
          console.log('Erro download file:', e);
        }

      }

      if(messageMedia.jpegThumbnail) {
        if(Buffer.byteLength(messageMedia.jpegThumbnail) > 0) {
            download.thumbnail = `${rname}_thum.jpg`;

            fs.writeFile(process.cwd() + '/public/cdn/' + download.thumbnail, messageMedia.jpegThumbnail, function(err) {
              if (err) {
                return console.log('Error thumbnail', err);
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

	that.CONNECTION.ev.on('messages.upsert', async chat => {

    //console.log(JSON.stringify(chat, undefined, 2));
    
    //messages is null
    if (!chat.messages) return; 

    const m = chat.messages[0];
    if(!m.message) return;

    // message to me
    if(m.key.remoteJid === WA_CLIENT.ME.jid) {
      try {
        await that.CONNECTION.sendReadReceipt(m.key.remoteJid, (m.isGroupMsg ? m.key.participant : undefined), [m.key.id]);  
      } catch(e) {
        //nda
      }
      return;
    }

    //ACK
    if(m.key.fromMe == true) {

      //send ACK
      queue.add(async (M = [m]) => {that.PROCESS_MESSAGE(M[0], 'ack')});
      
    } else {
    
    //MESSAGE

      const messageType = getContentType(m.message);
      if(messageType == 'ignore' && messageType == 'broadcast') return;

      let isPtt = false;

      //is ptt?
      try {
        isPtt = m.message[messageType].ptt;
      } catch(e) {
        isPtt = false;
      }

      m.type = MESSAGE_TYPE(messageType, isPtt);
      
      //Me
      m.id = WA_CLIENT.SETMSGID(m.key);
      m.me = WA_CLIENT.CONVERTOLDUID(WA_CLIENT.ME.jid);
      m.from = (messageType == 'broadcast'? WA_CLIENT.CONVERTOLDUID(m.key.participant) : WA_CLIENT.CONVERTOLDUID(m.key.remoteJid));
      m.isGroupMsg = isJidGroup(m.from);
      m.author = (m.isGroupMsg ? WA_CLIENT.CONVERTOLDUID(m.key.participant) : WA_CLIENT.CONVERTOLDUID(m.key.remoteJid));
      
      //forward
      if(m.message[messageType].contextInfo){

         const message = m.message[messageType];

         if(message.contextInfo.isForwarded) {
           m.isForwarded = message.contextInfo.isForwarded;
           m.forwardingScore = message.contextInfo.forwardingScore;
         } else {

           const messageTypeQ = Object.keys (message.contextInfo.quotedMessage)[0];
           const mQ = {message: message.contextInfo.quotedMessage};
           const mQType = MESSAGE_TYPE(messageTypeQ);
           m.mentionedJid = message.contextInfo.mentionedJid;
           m.quotedMsgId = WA_CLIENT.SETMSGID({ id: message.contextInfo.stanzaId, remoteJid: message.contextInfo.participant, fromMe: (message.contextInfo.participant === m.me)});
          
           //console.log(mQType, message.selectedButtonId)
           if(mQType == 'chat') {
             m.quotedMsgBody = {
               body: await BODY(mQ, messageTypeQ) 
             };
           } else if (mQType == 'buttons_response') {
             m.quotedMsgBody = { 
               buttonId: message.selectedButtonId, 
               body: message.selectedDisplayText
            };
           } else {
             m.quotedMsgBody = { body: mQType };
           }


         }
         
       }
           
      //get media info 
      m.media = await DOWNLOADBIN(m, m.type, messageType);

      //body
      m.body = await BODY(m, messageType);
      
      //get chat info           
      m.chat = await JIDINFO(m.key.remoteJid, m.pushName);

      //get sender info 
      m.sender = await JIDINFO((m.key.participant ? m.key.participant : m.key.remoteJid), m.pushName, (m.isGroupMsg ? m.key.remoteJid : null));   

      //get loc info
      m.location = await LOCATIONINFO(m);

      //console.log(JSON.stringify(m, undefined, 2));

      //send confirm read
      try {
        await that.CONNECTION.sendReadReceipt(m.key.remoteJid, (m.isGroupMsg ? m.key.participant : undefined), [m.key.id]);  
      } catch(e) {
        //nda
      }

      //send MSG
      queue.add(async (M = [m]) => {that.PROCESS_MESSAGE(M[0], 'message')});

    }

	})

  //chat notify update 
  that.CONNECTION.ev.on('chats.update', async m => {
  
    //console.log('chats.update', JSON.stringify(m, undefined, 2))
    for(const i of m) {
      if(i.name)
        await that.JIDINFO(i.id, i.name, null, true);  
    }

  })

  //event call
 that.CONNECTION.ws.on('CB:call', (m) => {
  if(m.content) {
    if(m.content[0].tag == 'terminate') {

      const call = {
          reason: m.content[0].attrs.reason,
          key: {
            remoteJid: m.content[0].attrs["call-creator"],
            fromMe: false,
            id: m.content[0].attrs["call-id"],
          },
          type: 'call'
      }
      
      queue.add(async (M = [call]) => {that.PROCESS_MESSAGE(M[0], 'call')});

      //console.log('Call', JSON.stringify(call, undefined, 2))
    }
  }
 });

	that.CONNECTION.ev.on('messages.update', msg => {

    const m = msg[0];
    
    //avoid send to me 
    if(m.key.remoteJid === WA_CLIENT.ME.jid)
      return;

    //send ACK
    queue.add(async (M = [m]) => {that.PROCESS_MESSAGE(M[0], 'ack')});

  })

	//that.CONNECTION.ev.on('message-receipt.update', m => console.log('message-receipt.update', JSON.stringify(m, undefined, 2)))
	//that.CONNECTION.ev.on('presence.update', m => console.log('presence.update', JSON.stringify(m, undefined, 2)))
	
      
  /*
  that.CONNECTION.ev.on('contacts.set', () => {
      //console.log('got contacts', Object.values(WA_STORE.contacts))
  })
  */

  //that.CONNECTION.ev.on('chats.set', item => console.log('chats.set', `recv ${item.chats.length} chats (is latest: ${item.isLatest})`))
	//that.CONNECTION.ev.on('messages.set', item => console.log('messages.set', `recv ${item.messages.length} messages (is latest: ${item.isLatest})`))
	//that.CONNECTION.ev.on('contacts.set', item => console.log('contacts.set', `recv ${item.contacts.length} contacts`))
  
  /*
  const sentMsg  = async () => {
    await that.CONNECTION.sendMessage("557981189757@s.whatsapp.net", { text: 'oh hello there' });
  }

  sentMsg();
  */

  //that.CONNECTION.ev.on('contacts.update', m => console.log('contacts.upsert', JSON.stringify(m, undefined, 2)))

};

WHATS_API.prototype.CONVERTOLDUID = function(id){

  var that = this;
  if(!id) return;

  if(id.indexOf('-') !== -1)
    return id.replace(new RegExp('s.whatsapp.net', 'g'), 'g.us');
  else {
    id = id.replace(new RegExp('s.whatsapp.net', 'g'), 'c.us');

    // remove : name
    if(id.includes(':')){
      id = id.split(':')[0] + '@c.us';
    }

    return id;

  }

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

WHATS_API.prototype.GETMESSAGEBYID = async function(msgid) {

  let msg;

  if(msgid) {
    const msgkey = WA_CLIENT.GETMSGKEY(msgid);

    //console.log(msgkey); 
    /*const msgInfo = await client.loadMessages(msgkey.remoteJid, 1, {fromMe: msgkey.fromMe, id: msgkey.id}, true).then( m => {
      //console.log(m);
      if(m.cursor != null && m.messages.length > 0)
        msg = m.messages[0];
    }).catch( e => {
      return;
    });*/

    const msgInfo = await getMessageFromStore(msgkey.remoteJid, msgkey.id).then( m => {
      //console.log(m);
      if(m.cursor != null && m.messages.length > 0)
        msg = m.messages[0];
    }).catch( e => {
      return;
    });

  }

  return msg;
}

WHATS_API.prototype.SET_QRCODE = async function(code){
  var that = this;

  if(qrCodeManager){
    qrCodeManager.send({ qr: code });
  };

  //send QRCode
  queue.add(async (M = [code]) => {that.PROCESS_MESSAGE(M[0], 'qr')});
  //that.PROCESS_MESSAGE({ qr: code }, 'qr');

  that.QR_CODE = code;
};

WHATS_API.prototype.KILL = async function() {
  var that = this;

  //close db
  WA_DB.CLOSE();     

  WA_ISCONNECTED = false;
  WA_CLIENT.CONNECTION = null;
  that.STATE = WA_STATE.none;
}

WHATS_API.prototype.CONNECT = function() {

  var that = this;
  WA_STORE = null;

  var connectWA = async function() {   

    //avoid open more that one session
    if(that.GET_STATE() != WA_STATE.none) return;

    that.SET_STATE(WA_STATE.initiated);

    // storage 
    //WA_STORE = makeInMemoryStore({ logger: P({ level: 'silent', stream: 'store' }) });


    // can be read from a file
    //WA_STORE.readFromFile(WA_CONFIG_STORE);

    // saves the state to a file every 10s
    /*setInterval(() => {
      WA_STORE.writeToFile(WA_CONFIG_STORE);
    }, 10_000)*/

    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    //set version WAWeb 
    WA_VERSION = (version ? version : (F.config['waversion'] ? eval(F.config['waversion']) : [2, 2206, 9]));

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
    WA_CONFIG.logger = (DEBUG) ? P({ level: "debug" }) : P({ level: 'silent' });

    //start service
    const sock = makeWASocket(WA_CONFIG);

    //persiste database
    //WA_STORE.bind(sock.ev);

    //handle: connection update
    sock.ev.on('connection.update', async u => {

            const { connection, lastDisconnect, qr } = u;

            let qrNotification = (connected, message) => {

              //send message if QR Code process
              if(qrCodeManager){                
                qrCodeManager.send({ 
                  connected: connected,
                  message: message
                });
              }

              //send QRCode
              that.PROCESS_MESSAGE({ 
                connected: connected,
                message: message
              }, 'qr');

              //if have socket send
              if(WA_SOCKET) {
                WA_SOCKET.send({ 
                  connected: connected,
                  message: message
                });
              } 

              WA_ISCONNECTED = connected;

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

                  that.SET_STATE(WA_STATE.none);
                  connectWA(); 

              }

            } else if(connection === 'open') {
                console.log('opened connection');

                //if QRCode inform success
                qrNotification(true, undefined);

                //db
                WA_DB.CONNECT();

                //start service
                that.SETUP(sock, WA_WEBHOOK, WA_TOKENKEY);

            } else if (connection == 'connecting') {
              console.log(connection + '...');              
            }
            
            //Send QRCODE
            if(qr) {
              
              that.SET_STATE(WA_STATE.qrcode);

              console.log('SCAN THE ABOVE QR CODE TO LOGIN!');
        
              const b64 = require('qrcode-base64').drawImg(qr, {
                typeNumber: 4,
                errorCorrectLevel: 'M',
                size: 250
              });
        
              //console.log(b64);
              that.SET_QRCODE(b64);
              
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
  WA_DB = new WHATS_DB(WA_CONFIG_DB);
  WA_CLIENT.CONNECT();  
});
