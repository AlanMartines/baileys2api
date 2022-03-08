//w2api - Version 0.0.8
var fs = require('fs');
const os = require("os");
const { download } = require('total.js/utils');
var request = require('request').defaults({ encoding: null });
const {
	MessageType,
	MessageOptions,
	Presence,
	Mimetype
  } = require('@adiwajshing/baileys');
global.ALLOW_TYPES = ['application/pdf','image/jpeg','image/png','audio/ogg','image/gif'];
global.ALLOW_PIC_TYPES = ['image/jpeg'];
global.default_timeout = 3000;
global.default_timeout_2 = 6000;
global.default_timeout_3 = 60000;
global.download = require('download-file');
var vCardsJS = require('vcards-js');
const WHATS_API = require('../modules/whatsapp');
global.qrCodeManager = null;
const sckClient = new Map();

exports.install = function() {
	
	/*
	* API ROUTES - Client Configuration
	* This route exist to you can scan qrCode remotelly from browser
	*/
	ROUTE('/{instance}/qrcode/',				view_qrcode			); //ok
	ROUTE('/{instance}/getQrcode/',				getQrcode			); //ok
	WEBSOCKET('/qrCodeSocket/', 				qrCodeSocket, 		['json']); //ok
	
	/*
	* API ROUTES - Services
	* This routes provide you methods to send messages over API 
	* Discover more over documentation at: 
	*/
	ROUTE('/{instance}/typing',					typing,				['post',default_timeout]); //ok
	ROUTE('/{instance}/sendMessage',			sendMessage,		['post',default_timeout]); //ok
	ROUTE('/{instance}/sendPTT',				sendPTT,			['post',default_timeout]); //ok
	ROUTE('/{instance}/sendFile',				sendFile,			['post',default_timeout_3]); //ok
	ROUTE('/{instance}/sendLinkPreview',		sendLinkPreview,	['post',default_timeout_2]); //parcial
	ROUTE('/{instance}/sendLocation',			sendLocation,		['post',default_timeout]); //ok
	ROUTE('/{instance}/sendGiphy', 				sendGiphy,			['post',default_timeout]); //ok
	ROUTE('/{instance}/sendSticker', 			sendSticker,		['post',default_timeout_2]); //ok
	ROUTE('/{instance}/sendContact',			sendContact,		['post',default_timeout]); //ok
	ROUTE('/{instance}/sendGhostForward',		sendGhostForward,	['post',default_timeout_2]); //ok
	ROUTE('/{instance}/getProfilePic',			getProfilePic,		['post',default_timeout]); //ok
	ROUTE('FILE /{instance}/getFile/*',		    getFile); //ok
	
	/* novas rotas */
	ROUTE('/{instance}/sendButtons',					sendButtons,				['post',default_timeout]); //ok
	ROUTE('/{instance}/sendReplyWithMentions',			sendReplyWithMentions,		['post',default_timeout_2]); //ok
	ROUTE('/{instance}/checkNumberStatus',				checkNumberStatus,			['post',default_timeout]); //ok

	/*
	* API ROUTES - PersonalInformation
	* This routes provide you methods to manipulate personal information of numberConnected
	* Discover more over documentation at: 
	*/
	ROUTE('/{instance}/setMyName/',				setMyName,			['post',default_timeout]); //ok
	ROUTE('/{instance}/setMyStatus/',			setMyStatus,		['post',default_timeout]); //ok
	ROUTE('/{instance}/setMyProfilePic/',		setMyProfilePic,	['post',default_timeout]); //ok

	/*
	* API ROUTES - Master Routes
	* This routes provide you methods to get branch of information over an single request
	* Discover more over documentation at: 
	*/
	ROUTE('/{instance}/dialogs',				dialogs,			['post',default_timeout]); //ok
	ROUTE('/{instance}/getChatById',			getChatById,		['post',default_timeout]); //ok

	/*
	* API ROUTES - Instance Routes
	* This routes provide you methods to manipulate instance
	* Discover more over documentation at: 
	*/
	ROUTE('/{instance}/{masterKey}/isConnected',			isConnected,		[]); //ok
	ROUTE('/{instance}/{masterKey}/batteryLevel',			batteryLevel,		[]); //ok
	ROUTE('/{instance}/{masterKey}/deleteFile', 			deleteFile, 		['post',default_timeout]); //OK

	/*
	* API ROUTES - Server Routes
	* This routes provide you methods to manipulate instance
	* Discover more over documentation at: 
	*/	
	ROUTE('/{masterKey}/readInstance',						readInstance,		[]); //ok
	ROUTE('/{masterKey}/reloadServer',						reloadServer,		[60000]); //OK
	ROUTE('/{masterKey}/killInstance',						killInstance,		[60000]); //OK
	ROUTE('/{masterKey}/setWebhook',						setWebhook,			['post',default_timeout]); //OK
	WEBSOCKET('/{masterKey}', 								waSocket, 			['json']); //OK

};

const BODY_CHECK = function(BODY){
	return new Promise(function(resolve, reject) {
		if (typeof BODY['chatId'] !== 'undefined') {
			resolve({status:true, chatId: WA_CLIENT.CONVERTNEWUID(BODY['chatId']) });
		} else {
			if (typeof BODY['phone'] !== 'undefined') {
				resolve({status:true, chatId: BODY['phone']+"@s.whatsapp.net" });
			} else {
				resolve({status:false});
			}
		}
	}).catch((err) => {
		console.log("########## ERROR AT VERIFY BODY ################");
		console.log(err);
		console.log("########## ERROR AT VERIFY BODY ################");
	});
};
const delay = function(time){
	new Promise(function(resolve, reject) {
		setTimeout(function(){return true},time);
	});
};

/*
Generate UUID
*/
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/* validate URL with regex */
function is_url(str)
{
  regexp =  /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+(:[0-9]+)?|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/;
        if (regexp.test(str))
          return true;
        else
          return false;
}

function get_buttonobj(obj) {
	let buttons = [];

	if(obj) {

		if(typeof obj === 'string')
			obj = eval(obj);

		for(i=0; i < obj.length; i++) {
			const b = {
				buttonId: obj[i].id, 
				buttonText: {displayText: obj[i].text}, 
				type: 1
			}
			buttons[i] = b;
		}
	}

	return buttons;
}

function get_mediatype(mime, fileName, caption) {

	if(!(mime))
		return;

	let out = {
		format: undefined,
		filename: undefined,
		filepath: undefined, 
		opt: undefined
	}

	const uuid = uuidv4().split('-');

	if(!(fileName)){
		fileName = (mime.split('/')[0] == 'video' || mime.split('/')[0] == 'image' ? uuid[0] + uuid[4] + '.' + mime.split('/')[1] : uuid[0] + uuid[4] + '.bin');
	} else {
		fileName = uuid[4] + '_' + fileName;
	}
	
	out.filepath = require('path').resolve(process.cwd(), 'tmp/' + fileName);

	//video 
	if(mime == Mimetype.gif || mime == Mimetype.mp4 || mime.split('/')[0] == 'video') {

		out.format = MessageType.video;
		out.opt = {
					mimetype: null, 
					caption: (caption ? caption : ''), 
					filename: (fileName ? fileName : undefined)
				 };

		switch (mime) {
			case "video/gif":
				out.opt.mimetype = Mimetype.gif;
				break;
		
			default:
				out.opt.mimetype = Mimetype.mp4;
				break;
		}

		return out;
	}

	//image
	if(mime == Mimetype.jpeg || mime == Mimetype.png || mime == Mimetype.webp || mime.split('/')[0] == 'image') {

		out.format = MessageType.image;
		out.opt = {
					mimetype: null, 
					caption: (caption ? caption : ''), 
					filename: (fileName ? fileName : undefined)
				 };

		switch (mime) {
			case "image/png":
				out.opt.mimetype = Mimetype.png;
				break;

			case "image/webp":
					out.opt.mimetype = Mimetype.webp;
					break;		
					
			default:
				out.opt.mimetype = Mimetype.jpeg;
				break;
		}

		return out;
	}

	//audio
	if(mime == Mimetype.ogg || mime == Mimetype.mp4Audio || mime.split('/')[0] == 'audio') {

		out.format = MessageType.audio;
		out.opt = {
					mimetype: null, 
					filename: (fileName ? fileName : undefined)
				 };

		switch (mime) {
			case "audio/ogg":
				out.opt.mimetype = Mimetype.ogg;
				break;
			
			case Mimetype.ogg:
					out.opt.mimetype = Mimetype.ogg;
					break;
					
			default:
				out.opt.mimetype = Mimetype.mp4Audio;
				break;
		}

		return out;
	}

	//document
	out.format = MessageType.document;
	out.opt = {
				mimetype: null, 
				caption: (caption ? caption : ''), 
				filename: (fileName ? fileName : undefined)
	};

	switch (mime) {
		case Mimetype.pdf:
			out.opt.mimetype = Mimetype.pdf;
			break;
	
		default:
			out.opt.mimetype = mime;
			break;
	}

	return out;	
}

/* update env */
function setEnvValue(key, value) {

    // read file from hdd & split if from a linebreak to a array
    const ENV_VARS = fs.readFileSync(WA_CONFIG_ENV, "utf8").split(os.EOL);

    // find the env we want based on the key
    const target = ENV_VARS.indexOf(ENV_VARS.find((line) => {
        return line.match(new RegExp(key));
    }));

    // replace the key/value with the new value
    ENV_VARS.splice(target, 1, `${key}=${value}`);

    // write everything back to the file system
    fs.writeFileSync(WA_CONFIG_ENV, ENV_VARS.join(os.EOL));

}


/* http download */
const download_http = (url, path, callback) => {
	request.head(url, (err, res, body) => {
		if (!err && res.statusCode == 200) {
			request(url)
				.pipe(fs.createWriteStream(path))		
				.on('close', callback);	
		} else {
			callback(err);
		}
	});
  }

/*
* WEBSOCKET
* this snippet is responsible for keep qrCode refresing on /qrcode/
* performance: operational
*/
function qrCodeSocket(){
	qrCodeManager = this;
	qrCodeManager.on('open', function(client) {
		client.send({ message: 'Whats2API is the best Library! - ID:{0}'.format(client.id) });
	});
	qrCodeManager.on('message', function(client, message) {
		console.log(client, message);
	});
};

function waSocket(){
	WA_SOCKET = this;

	WA_SOCKET.autodestroy();

	WA_SOCKET.on('open', function(client) {
		console.log('Connect ' + client.id + ' / Online:', WA_SOCKET.online);
		client.send({ status: true, id: '{0}'.format(client.id) });
	});

	WA_SOCKET.on('message', function(client, message) {
		console.log(message);
		//console.log(client, message);
	});

	WA_SOCKET.on('close', function(client) {
		console.log('Disconnect ' + client.id + ' / Online:', WA_SOCKET.online);		
	});
};



/*
* Route to send Messages
* tested on version 0.0.8
* performance: operational
*/
function sendMessage(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			if (typeof BODY['body'] !== 'undefined') {
				BODY_CHECK(BODY).then(function(processData){
					if(processData.status){				
						
						//notify after send message who is the id message
						var getId = async function() {							
								
							var r = await WA_CLIENT.CONNECTION.sendMessage(processData.chatId, BODY['body'], MessageType.text);	
							self.json({status:true, id: WA_CLIENT.SETMSGID(r.key) });
						}						
						getId();
						
					} else {
						self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
					}
				});
			} else {
				self.json({status:false, err: "Paramether body is mandatory"});
			}
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Route to send Button
* tested on version 0.0.8
* performance: operational
*/
function sendButtons(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			if (typeof BODY['body'] !== 'undefined'  &&
				typeof BODY['buttons'] !== 'undefined') {
				BODY_CHECK(BODY).then(function(processData){
					if(processData.status){				
					
						var getId = async function() {	

							const buttonMessage = {
								contentText: BODY['body'],
								footerText: (BODY['footer'] ? BODY['footer'] : ""),
								header: (BODY['title'] ? BODY['title'] : undefined),
								buttons: get_buttonobj(BODY['buttons']),
								headerType: (BODY['title'] ? 2 : 1)
							}

							let r = await WA_CLIENT.CONNECTION.sendMessage(processData.chatId, buttonMessage, MessageType.buttonsMessage);	
							self.json({status:true, id: WA_CLIENT.SETMSGID(r.key)});
						}		
						
						getId();
						
					} else {
						self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
					}
				});
			} else {
				self.json({status:false, err: "Paramether body is mandatory"});
			}
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Route to send Reply
* tested on version 0.0.8
* performance: operational
*/
function sendReplyWithMentions(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			if (typeof BODY['body'] !== 'undefined'  &&
				typeof BODY['messageid'] !== 'undefined') {
				BODY_CHECK(BODY).then(function(processData){
					if(processData.status){				
						
						//notify after send message who is the id message
						var getId = async function() {	

							const mQuote = await WA_CLIENT.GETMESSAGEBYID(WA_CLIENT.CONNECTION, BODY['messageid']);
							if(mQuote) {
								const mOpt = { quoted: mQuote };

								let r = await WA_CLIENT.CONNECTION.sendMessage(processData.chatId, BODY['body'], MessageType.text, mOpt);	
								self.json({status:true, id:WA_CLIENT.SETMSGID(r.key)});
							} else {
								self.json({status:false, err: "Message not found"});
							}
						}					
						getId();
						
					} else {
						self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
					}
				});
			} else {
				self.json({status:false, err: "Paramether body is mandatory"});
			}
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Route to send Audios as file attached
* tested on version 0.0.8
* performance: operational
*/
function sendPTT(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			if (typeof BODY['audio'] !== 'undefined') {
				BODY_CHECK(BODY).then(function(processData){	
					if(processData.status){

						if(is_url(BODY['audio'])) {

							var getId = async function() {

								let r = null;

								r = await WA_CLIENT.CONNECTION.sendMessage(
									processData.chatId, 
									{ url: BODY['audio'] }, // send directly from remote url!
									MessageType.audio, 
									{ mimetype: Mimetype.ogg, caption: (BODY['caption'] ? BODY['caption'] : ""), filename: 'audio.ogg' }
								)												
								
								self.json({status:true, id: WA_CLIENT.SETMSGID(r.key) });
							}	

							getId();

						} else {
							self.json({status:false, err: "URL not is valid!"});
						}

					} else {
						self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
					}
				});
			} else {
				self.json({status:false, err: "Paramether audio is mandatory"});
			}
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Route to send Files
* tested on version 0.0.8
* performance: operational
*/
function sendFile(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			if (typeof BODY['filename'] !== 'undefined' && typeof BODY['mimetype'] !== 'undefined' && (typeof BODY['base64'] !== 'undefined' || typeof BODY['url'] !== 'undefined')) {
				BODY_CHECK(BODY).then(function(processData){
					if(processData.status){	

						let out = get_mediatype(BODY['mimetype'], BODY['filename'], BODY['caption']);
						if(out) {

							if(typeof BODY['url'] !== 'undefined') {
								//use url
								if(is_url(BODY['url'])) {

									download_http(BODY['url'], out.filepath, (e) => {
										if(!e) {

											var getId = async function() {		
												let r = null;

												try {											
													r = await WA_CLIENT.CONNECTION.sendMessage(
														processData.chatId, 
														{ url: out.filepath }, 
														out.format, 
														out.opt
													);

												} catch(e) {
													console.log(e);
													self.json({status:false, err: "Error when try upload file" });
												} finally {

													//delete arquivo
													if (fs.existsSync(out.filepath)) {
														fs.unlinkSync(out.filepath);
													}
													
													if(r)
														self.json({status:true, id: WA_CLIENT.SETMSGID(r.key) });
												}
											}	

											getId();

										} else {
											self.json({status:false, err: "Erro on download media"});
										}									
									});	

								} else {
									self.json({status:false, err: "URL not is valid!"});
								}
							} else {						
								//use b64 file
								fs.writeFile(out.filepath, BODY['base64'], {encoding: 'base64'}, function(err) {
									var getId = async function() {		
										let r;

										try {

											r = await WA_CLIENT.CONNECTION.sendMessage(
												processData.chatId, 
												fs.readFileSync(out.filepath), 
												out.format, 
												out.opt
											);

										}  catch(e) {
											console.log(e);
											self.json({status:false, err: "Error when try upload file" });
										} finally {

											//delete arquivo
											if (fs.existsSync(out.filepath)) {
												fs.unlinkSync(out.filepath);
											}
											
											if(r)
												self.json({status:true, id: WA_CLIENT.SETMSGID(r.key) });
										}										
									}						
									getId();
								});
							}

						} else {
							self.json({status:false, err: "Format not defned"});
						}

					} else {
						self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
					}
				});
			} else {
				self.json({status:false, err: "Paramether body and filename is both mandatory or mimetype and base64"});
			}			
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Route to send location
* tested on version 0.0.8
* performance: degradated
*/
function sendLocation(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			if (typeof BODY['lat'] !== 'undefined' && typeof BODY['lng'] !== 'undefined') {
				BODY_CHECK(BODY).then(function(processData){
					if(processData.status){
						var getId = async function() {							
							
							let r = await WA_CLIENT.CONNECTION.sendMessage(processData.chatId, {degreesLatitude: BODY['lat'], degreesLongitude: BODY['lng'], address: (BODY['address'] ? BODY['address'] : null)}, MessageType.location)					
							self.json({status:true, id:  WA_CLIENT.SETMSGID(r.key)});
						}						
						getId();
					} else {
						self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
					}
				});
			} else {
				self.json({status:false, err: "Os parâmetros lat, lng e address são obrigatório"});
			}
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Route to send Giphy
* tested on version 0.0.8
* performance: degradated
*/
function sendGiphy(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			if (typeof BODY['link'] !== 'undefined' && typeof BODY['caption'] !== 'undefined') {
				BODY_CHECK(BODY).then(function(processData){
					if(processData.status){
						if(is_url(BODY['link'])) {

							var getId = async function() {

								let r = null;

								r = await WA_CLIENT.CONNECTION.sendMessage(
									processData.chatId, 
									{ url: BODY['link'] }, // send directly from remote url!
									MessageType.video, 
									{ mimetype: Mimetype.gif, caption: (BODY['caption'] ? BODY['caption'] : "") }
								)												
								
								self.json({status:true, id: WA_CLIENT.SETMSGID(r.key) });
							}	

							getId();

						} else {
							self.json({status:false, err: "URL not is valid!"});
						}
					} else {
						self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
					}
				});
			} else {
				self.json({status:false, err: "Parameters 'link' and 'caption' are mandatory"});
			}
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Route to send Giphy
* tested on version 0.0.8
* performance: degradated
*/
function sendSticker(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			if (typeof BODY['link'] !== 'undefined' && typeof BODY['caption'] !== 'undefined') {
				BODY_CHECK(BODY).then(function(processData){
					if(processData.status){
						if(is_url(BODY['link'])) {

							var getId = async function() {

								let r = null;

								r = await WA_CLIENT.CONNECTION.sendMessage(
									processData.chatId, 
									{ url: BODY['link'] }, // send directly from remote url!
									MessageType.image, 
									{ mimetype: Mimetype.webp, caption: (BODY['caption'] ? BODY['caption'] : "") }
								)												
								
								self.json({status:true, id: WA_CLIENT.SETMSGID(r.key) });
							}	

							getId();

						} else {
							self.json({status:false, err: "URL not is valid!"});
						}
					} else {
						self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
					}
				});
			} else {
				self.json({status:false, err: "Parameters 'link' and 'caption' are mandatory"});
			}
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Route to send Contact
* tested on version 0.0.2
* performance: NotTested
*/
function sendContact(instance){
	var self = this;
	var BODY = self.body;
	var vCard = vCardsJS();
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			if (typeof BODY['workPhone'] !== 'undefined' && typeof BODY['firstName'] !== 'undefined') {
				BODY_CHECK(BODY).then(function(processData){
					if(processData.status){
						vCard.firstName = BODY['firstName'];
						vCard.middleName = BODY['middleName'] ? BODY['middleName'] : '';
						vCard.lastName = BODY['lastName'] ? BODY['lastName'] : '';
						vCard.organization = BODY['organization'] ? BODY['organization'] : '';
						if(BODY['photo']){
							vCard.photo.attachFromUrl(BODY['photo'], 'JPEG');
						}
						vCard.workPhone = BODY['workPhone'] ? BODY['workPhone'] : '';
						vCard.title = BODY['title'] ? BODY['title'] : '';
						vCard.url = BODY['url'] ? BODY['url'] : '';
						vCard.note = BODY['note'] ? BODY['note'] : '';
						//console.log(vCard.getFormattedString());
						//console.log(BODY['vcard']);
						var getId = async function() {
							 let r = null;
							 
							if(BODY['vcard']) {
								r  = await WA_CLIENT.CONNECTION.sendMessage(processData.chatId, {displayname: BODY['firstName'], vcard: BODY['vcard']}, MessageType.contact);
							} else {
								r  = await WA_CLIENT.CONNECTION.sendMessage(processData.chatId, {displayname: BODY['firstName'], vcard: vCard.getFormattedString()}, MessageType.contact);								
							}
							self.json({status:true, id: WA_CLIENT.SETMSGID(r.key)});
						}						
						getId();
					} else {
						self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
					}
				});
			} else {
				self.json({status:false, err: "Parameter 'workPhone' and 'firstName' are mandatory"});
			}
		} else {
			self.json({status:false, err: "Your company is not set yet"});
		}
	}
}

/*
* Route to send Link with thumbPreviw
* tested on version 0.0.8
* performance: operational
*/
function sendLinkPreview(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			if (typeof BODY['link'] !== 'undefined' && typeof BODY['text'] !== 'undefined') {
				BODY_CHECK(BODY).then(function(processData){
					if(processData.status){
						//var getId = null;
						var getId = async function() {
							/* If [type] not defined is default linkpreview */
							if( typeof BODY['type'] == 'undefined' &&								
								typeof BODY['title'] !== 'undefined' &&
								typeof BODY['description'] !== 'undefined' &&
								typeof BODY['text'] !== 'undefined') {		

									let r = null;									
									let buf;	

									if(typeof BODY['base64'] !== 'undefined') {	

										const uuid = uuidv4().split('-');
										const tmpfilename = require('path').resolve(process.cwd(), 'tmp/' + uuid[0] + uuid[4])

										fs.writeFile(tmpfilename, BODY['base64'], {encoding: 'base64'}, function(err) {
											
											try {
												buf = fs.readFileSync(tmpfilename);
											}  catch(e) {
												console.log(e);
												self.json({status:false, err: "Error when try upload file" });
											} finally {
	
												//delete arquivo
												if (fs.existsSync(tmpfilename)) {
													fs.unlinkSync(tmpfilename);
												}
											}
										});


									}
									
									if(buf) {
									
										r = await WA_CLIENT.CONNECTION.sendMessage(processData.chatId, BODY['text'], MessageType.text, {
											contextInfo: {
											externalAdReply: {
												title: BODY['title'],
												body: BODY['description'],
												thumbnail: buf,											  
												sourceUrl: BODY['link'],
												mediaType: 1,
											}
											}
										});

									} else {

										r = await WA_CLIENT.CONNECTION.sendMessage(processData.chatId, { 
											description: BODY['description'],
											title: BODY['title'],
											matchedText: BODY['link'],
											canonicalUrl: BODY['link'],
											//text: BODY['text'],
											jpegThumbnail: undefined,
											previewType: 0
										
										}, MessageType.extendedText);

									}

									self.json({status:true, id: WA_CLIENT.SETMSGID(r.key) });

							} else {

									r = await WA_CLIENT.CONNECTION.sendMessage(processData.chatId, BODY['text'] + '\n' + BODY['link'], MessageType.text, {
										detectLinks: true
									  });	
									self.json({status:true, id: WA_CLIENT.SETMSGID(r.key) });

							}
							 
							 
							 /*if(BODY['type'] == 'yt') {								
									var r = null;
									r = await WA_CLIENT.CONNECTION.sendYoutubeLink(processData.chatId,BODY['link'], BODY['text']);
									self.json({status:true, id: r});					
								
							} else if(typeof BODY['type'] == 'undefined') {
									var r = null;
									r = await WA_CLIENT.CONNECTION.sendLinkWithAutoPreview(processData.chatId,BODY['link'], BODY['text']);
									//console.log(r);
									r = await WA_CLIENT.CONNECTION.getMyLastMessage(processData.chatId);
									self.json({status:true, id: r.id});																
								
							} */
						}

						getId();

						/*if(getId !== null) {
							getId();
						} else {
							self.json({status:false, err: "Parameters is worng"});
						}*/

					} else {
						self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
					}
				});
			} else {
				self.json({status:false, err: "Parameter 'link' and 'text' are mandatory"});
			}
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Route to send Messages
* tested on version 0.0.8
* performance: operational
*/
function sendGhostForward(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			if (typeof BODY['id'] !== 'undefined') {
				BODY_CHECK(BODY).then(function(processData){
					if(processData.status){		
						
						//notify after send message who is the id message
						var getId = async function() {	

							const mQuote = await WA_CLIENT.GETMESSAGEBYID(WA_CLIENT.CONNECTION, BODY['id']);
							if(mQuote) {
								let r = await WA_CLIENT.CONNECTION.forwardMessage(processData.chatId, mQuote, false);	
								self.json({status:true, id:WA_CLIENT.SETMSGID(r.key)});
							} else {
								self.json({status:false, err: "Message not found"});
							}
						}				

						getId();
						
					} else {
						self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
					}
				});
			} else {
				self.json({status:false, err: "Paramether ID is mandatory"});
			}
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* That route allow you to get all dialog list from device
* tested on version 0.0.8
* performance: Operational
*/
function dialogs(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			const client = WA_CLIENT.CONNECTION;
			self.json({status:true, dialogs: client.contacts });
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* That route allow you to get information about an chat just using id of contact
* tested on version 0.0.8
* performance: Operational
*/
function getChatById(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			BODY_CHECK(BODY).then(function(processData){
				if(processData.status){

					const client = WA_CLIENT.CONNECTION;

					if(client.contacts[processData.chatId]) {  

						let u = {
						  formattedName: client.contacts[processData.chatId].name,
						  pushName: client.contacts[processData.chatId].notify,
						  profilePic: undefined,
						  shortName: client.contacts[processData.chatId].short,
						  from: WA_CLIENT.CONVERTOLDUID(client.contacts[processData.chatId].jid)
						}  
						
						const uPic = client.getProfilePicture(processData.chatId).then( p => {
							u.profilePic = p;
						});
						
						self.json({status:true, data: u});

					} else {
						self.json({status:false, err: "Chat not found."});
					}

				} else {
					self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
				}
			});
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* That route allow you to ger profilePic from someone based on 
* performance: Not Tested
*/
function getProfilePic(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			BODY_CHECK(BODY).then(function(processData){
				if(processData.status){
					const uPic = WA_CLIENT.CONNECTION.getProfilePicture(processData.chatId).then( p => {
						self.json({status:true, url: p});
					});
				} else {
					self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
				}
			});
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* That route allow you to ger profilePic from someone based on 
* performance: Not Tested
*/
function getFile(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			if(self.query['filename'] != "") {
				self.file('~' + F.path.public('cdn/' + decodeURIComponent(self.query['filename'])));
			} else {
				console.log({status:false, err: "File name not defined, set value 'filename' "});
			}			
		} else {
			console.log({status:false, err: "Wrong token authentication"});
		}
	} else {
		console.log({status:false, err: "Your company is not set yet"});
	}
}

/*
* That route allow you to simulate typing into an conversation
* performance: Not Tested
*/
function typing(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			BODY_CHECK(BODY).then(function(processData){
				if(processData.status){
					if(typeof BODY['state'] !== 'undefined'){

						WA_CLIENT.CONNECTION.updatePresence(processData.chatId,(BODY['state'] ? Presence.composing : Presence.paused));
						self.json({status:true});

					} else {
						self.json({status:false, err: "Parameter state is not set"});
					}
				} else {
					self.json({status:false, err: "Internal error, please contact support team"});
				}
			});
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Check if number is whatsapp
* performance: Not Tested
*/
function checkNumberStatus(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			BODY_CHECK(BODY).then(function(processData){
				if(processData.status){
					
					var getId = async function() {
						//var r = await WA_CLIENT.CONNECTION.checkNumberStatus(processData.chatId);
						let r = await WA_CLIENT.CONNECTION.isOnWhatsApp(processData.chatId);
						
						//console.log(r);
						if(r) {
							const jid = (r.jid ? WA_CLIENT.CONVERTOLDUID(r.jid) : undefined);

							self.json({status:true, data: {
								id: {
									server: (jid ? jid.split("@")[1] : undefined),
									user: (jid ? jid.split("@")[0] : undefined),
									_serialized: (jid ? jid : undefined)
								},
								isBusiness: (r.isBusiness ? true : false),
								numberExists: r.exists,
								status: (r.exists ? 200 : 404),
								canReceiveMessage: true
							} });
						} else {
							self.json({status:false, err: "number not exist"});
						}
					}
					getId();
					
				} else {
					self.json({status:false, err: "Internal error, please contact support team"});
				}
			});
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Route to check if your device is connected of not to application
* tested on version 0.0.8
* performance: Operational
*/
function isConnected(instance,masterKey){
	var self = this;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			let r = WA_CLIENT.CONNECTION.phoneConnected;
			self.json({status:true, instance_status: r});

		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}


/*
* Route to change your personal name of number Connected
* tested on version 0.0.8
* performance: Degradated
*/
function setMyName(){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(BODY['newName']){
			if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
				var getId = async function() {
					console.log("Setting new name: ",BODY['newName']);
					var r = await WA_CLIENT.CONNECTION.updateProfileName(BODY['newName']);
					self.json({status:true});
				}
				getId();
			} else {
				self.json({status:false, err: "Wrong token authentication"});
			}
		} else {
			self.json({status:false, err: "newName paramether is mandatory!"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Route to change your personal status of number Connected
* tested on version 0.0.8
* performance: Operational
*/
function setMyStatus(){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(BODY['newStatus']){
			if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
				var getId = async function() {
					console.log("Setting new status: ",BODY['newStatus']);
					var r = await WA_CLIENT.CONNECTION.setStatus(BODY['newStatus']);
					self.json({status:true});
				}
				getId();
			} else {
				self.json({status:false, err: "Wrong token authentication"});
			}
		} else {
			self.json({status:false, err: "newStatus paramether is mandatory!"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}


function setMyProfilePic(instance){
	var self = this;
	var BODY = self.body;
	if(WA_CLIENT){
		if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
			if (typeof BODY['url'] !== 'undefined') {
				BODY_CHECK(BODY).then(function(processData){	
					if(processData.status){

						if(is_url(BODY['url'])) {

							request.get(BODY['url'], function (error, response, body) {
								if (!error && response.statusCode == 200) {
									const buf = Buffer.from(body);
									if(ALLOW_PIC_TYPES.includes(response.headers["content-type"].split(';')[0])){
										var getId = async function() {	
											let r = await WA_CLIENT.CONNECTION.updateProfilePicture(processData.chatId, buf);
											self.json({status:true});
										}						
										getId();
								    } else {
										self.json({status:false, err: "Type of file not allowed"});
								    }
								} else {
									self.json({status:false, err: "Internal error to process this file - contact support now"});
								}
							});							
							

						} else {
							self.json({status:false, err: "URL not is valid!"});
						}

					} else {
						self.json({status:false, err: "It is mandatory to inform the parameter 'chatId' or 'phone'"});
					}
				});
			} else {
				self.json({status:false, err: "Paramether audio is mandatory"});
			}
		} else {
			self.json({status:false, err: "Wrong token authentication"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* This route allow you to check battery of device running whatsApp
* tested on version 0.0.8
* performance: Operational
*/
function batteryLevel(instance,masterKey){
	var self = this;
	if(WA_CLIENT){
		if(WA_MASTERKEY == decodeURIComponent(masterKey)){
			if(WA_CLIENT.TOKEN == decodeURIComponent(self.query['token'])){
				self.json({status:true, batteryLevel: WA_BATTERY});
			} else {
				self.json({status:false, err: "Wrong token authentication"});
			}
		} else {
			self.json({status:false, err: "You don't have permissions to this action"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Read information about instance running
* tested on version 0.0.8
* performance: Operational
*/
async function readInstance(masterKey){
	var self = this;
	if(WA_CLIENT){
		if(WA_MASTERKEY == decodeURIComponent(masterKey)){
			//console.log(WA_CLIENT.CONNECTION);
			try {
				var isConnected = await WA_CLIENT.CONNECTION.phoneConnected; 
				var getBattery = WA_BATTERY;
				var me = {
					id: WA_CLIENT.INSTANCE,
					pushname: WA_CLIENT.CONNECTION.user.name,
					isBusiness: true,
					status: WA_CLIENT.CONVERTOLDUID(WA_CLIENT.CONNECTION.user.jid),
					profilePicThumb: "",
					wid: WA_CLIENT.CONVERTOLDUID(WA_CLIENT.CONNECTION.user.jid),
					connected: isConnected,
					battery: getBattery,
					phone: WA_CLIENT.CONNECTION.user.phone
				};
				var resetState = await WA_CLIENT.CONNECTION.updatePresence(WA_CLIENT.CONNECTION.user.jid, Presence.available); 
				var connectionState = (isConnected ? 'CONNECTED' : 'OFF-LINE');
				var wapiversion = "";				
				self.json({
					status: true,
					resetState: undefined,
					networkData: isConnected,
					battery: getBattery,
					state: connectionState,
					webhook: WA_CLIENT.WEBHOOK,
					wapiVersion:wapiversion,
					info: me
				}, true);
			} catch (error) {
				self.json({status:false, err: "You don't have session enable."});
			}
		} else {
			self.json({status:false, err: "You don't have permissions to this action"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Change webhook address over POST request
* tested on version 0.0.8
* performance: Not Tested
*/
function setWebhook(masterKey){
	var self = this;
	if(WA_CLIENT){
		if(WA_MASTERKEY == decodeURIComponent(masterKey)){
			WA_CLIENT.WEBHOOK = self.body['webhook'];
			WA_WEBHOOK = self.body['webhook'];
			setEnvValue("WA_WEBHOOK", self.body['webhook']);
			self.json({status:true, webhook: self.body['webhook']});
		} else {
			self.json({status:false, err: "You don't have permissions to this action"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
}

/*
* Reloading instance over webhook
* tested on version 0.0.8
* performance: Operational
*/
async function reloadServer(masterKey){
	var self = this;
	if(WA_CLIENT){
		if(WA_MASTERKEY == decodeURIComponent(masterKey)){		
				WA_CLIENT.KILL();
				delay(8000);
				WA_CLIENT.CONNECT();  
			self.json({status:true});
		} else {
			self.json({status:false, err: "You don't have permissions to this action"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
};

/*
* Kill instance over webhook
* tested on version 0.0.8
* performance: Operational
*/
async function killInstance(masterKey){
	var self = this;
	if(WA_CLIENT){
		if(WA_MASTERKEY == decodeURIComponent(masterKey)){
			
			
			if(Object.keys(WA_CLIENT.CONNECTION).length !== 0){
				await WA_CLIENT.KILL();							 					
			}

			var relativePath = require('path').resolve(process.cwd(), 'whatsSessions/' + WA_INSTANCE + '.data.json');
			
			//delete arquivo
			if (fs.existsSync(relativePath)) {
				fs.unlinkSync(relativePath);				
			}
			
			WA_CLIENT.CONNECT();

			//setTimeout(WA_CLIENT.CONNECT(),8000);	
			
			self.json({status:true});
			
		} else {
			self.json({status:false, err: "You don't have permissions to this action"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
};

/*
* Route check your QRCode over browser
* tested on version 0.0.8
* performance: Operational
*/
function view_qrcode(CLIENT_ID){
	var self = this;
	if(WA_CLIENT){
		self.view('qrcode', {qrcode: WA_CLIENT.QR_CODE, address: F.ip+':'+F.port });
	} else {
		self.throw404('QR CODE NOT FOUND IN THIS SERVER');
	}
};

function getQrcode(CLIENT_ID){
	var self = this;
	if(WA_CLIENT){
		self.json({status:true, qrcode: WA_CLIENT.QR_CODE});
	} else {
		self.json({status:false, err: "QR CODE NOT FOUND IN THIS SERVER"});
	}
};

/*
* Route to delete some file on internal CDN
* tested on version 0.0.9
* performance: Operational
*/
function deleteFile(instance, masterKey){
	var self = this;
	if(WA_CLIENT){
		if(WA_MASTERKEY == decodeURIComponent(masterKey)){
			try {
				if (fs.existsSync(process.cwd()+'/public/cdn/'+self.body['filename'])) {
				    fs.unlinkSync(process.cwd()+'/public/cdn/'+self.body['filename']);
					self.json({ status: true });
				} else {
					self.json({ status: true, err: "Sounds like this file dosn't exist in CDN" });
				}
			} catch(err) {
				self.json({ status: false, err: err });
			}
		} else {
			self.json({status:false, err: "You don't have permissions to this action"});
		}
	} else {
		self.json({status:false, err: "Your company is not set yet"});
	}
};