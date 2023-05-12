import rp from "request-promise";
import fs from "fs";
import chalk from "chalk";
import { Key as RSA, hex2b64 } from "node-bignumber"
import SteamTotp from "steam-totp"
import readline from "readline"
import axios from "axios"
import { HttpsProxyAgent } from "https-proxy-agent";
import crypto from "crypto"
import path from "path";

import dotenv from 'dotenv'
dotenv.config({ path: "../.env" })
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];


const requestTimeoutInterceptor = (config) => {
    if (!config.timeout) config.timeout = 15e3
    if (config.timeout === undefined || config.timeout === 0) {
        return config
    }
    const source = axios.CancelToken.source()

    setTimeout(() => {
        source.cancel(`Cancelled request. Took longer than ${(config.timeout / 1000).toFixed(0)}s.`)
    }, config.timeout)

    // If caller configures cancelToken, preserve cancelToken behaviour.
    if (config.cancelToken) {
        config.cancelToken.promise.then((cancel) => {
            source.cancel(cancel.message)
        })
    }


    return { ...config, cancelToken: source.token }
}



axios.defaults.proxy = false
axios.defaults.timeout = 10e3
axios.interceptors.request.use(requestTimeoutInterceptor)


let USER_AGENT = (process.platform == "win32") ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.0.0 Safari/537.36"



class Steam {

    constructor(accountName, accountsDir = '../accounts/') {
        if (accountName) {
            if (typeof accountName == "number") accountName = accountName.toString()

            if (accountsDir && typeof accountName === 'string') {
                this.accountName = accountName.toString()
                this.accPath = path.join(accountsDir, `${accountName}.json`)
                this.config = JSON.parse(fs.readFileSync(this.accPath))
            } else {

                this.accPath = accountsDir

                this.config = accountName
                this.accountName = accountName.tag ? accountName.tag : "FAKE"
            }


            this.session = this.config.session
            this.balance = 0

            this.leftLogginAttemptsAmount = 3


            this.axiosSession = axios.create({
                headers: this.headers,
                httpsAgent: new HttpsProxyAgent(this.config.proxy),
            })
            this.headers = {
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
                "accept-language": "en-US,en;q=0.9",
                "cache-control": "max-age=0",
                "content-type": "multipart/form-data; boundary=----WebKitFormBoundaryK5XcBUBBI8ZW2JBA",
                "sec-ch-ua": "\"Chromium\";v=\"103\", \".Not/A)Brand\";v=\"99\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"macOS\"",
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "same-origin",
                "Referrer-Policy": "strict-origin-when-cross-origin",
                "sec-fetch-user": "?1",
                'user-agent': USER_AGENT
            }

            this.RpDefS = rp.defaults({
                proxy: this.config.proxy,
                gzip: true,
                headers: this.headers
            })
            if (this.session && this.session.cookie) {
                this.s = rp.defaults({
                    proxy: this.config.proxy,
                    gzip: true,
                    headers: {
                        cookie: this.session.cookie,
                        'user-agent': USER_AGENT
                    }
                })

            } else {
                this.s = rp.defaults({
                    proxy: this.config.proxy,
                    gzip: true,
                    headers: {
                        'user-agent': USER_AGENT
                    }
                })
            }

            this.s.forever = true



        } else {
            this.s = rp.defaults({
                gzip: true,
                headers: {
                    'user-agent': USER_AGENT
                }
            })
            this.parseSession = true
        }
        this.bannedOrderParseProxy = []

    }


    delay(ms = 1000) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }





    //Check login status TRADE LINK AND APIKEY
    async checkLogin(log = true, tryes = 1, receiveApiKey = true) {

        // console.log(this)
        try {

            if (!this.config.session || !this.config.session.sessionid) {
                console.log(`${this.accountName} | Making a request for the steam login | session is lost`);
                let loginStatus = await this.login()
                if (loginStatus && (!this.config.tradelink || !this.config.steamApiKey) && this.accountName != "table") {
                    // console.log(chalk.green('Receive tradelink and Steam API Key'));
                    let tradelinkStatus = await this.getTradeLink()
                    if (!tradelinkStatus) console.log('Error with receive tradelink', this.accountName);
                    if (receiveApiKey) {
                        let apiKeyStatus = await this.registerApiKey()
                        if (!apiKeyStatus) console.log('Error with receive Steam API Key', this.accountName);
                    }
                }

                return loginStatus
            } else {
                let sessionStatus = await this.loggedIn()

                let timeNow = new Date().getTime() / 1000

                if (sessionStatus && this.config.session.loginTime && timeNow - this.config.session.loginTime < 259200) {
                    this.s = this.s.defaults({ headers: { cookie: this.session.cookie } })
                    if (log)
                        console.log(chalk.green('Session work status - true', this.accountName));
                    if (!this.config.tradelink || !this.config.steamApiKey && this.accountName != "table") {
                        let tradelinkStatus = await this.getTradeLink()
                        if (!tradelinkStatus) console.log('Error with receive tradelink', this.accountName);
                        if (receiveApiKey) {
                            let apiKeyStatus = await this.registerApiKey()
                            if (!apiKeyStatus) console.log('Error with receive Steam API Key', this.accountName);
                        }
                    }
                    return true
                } else {
                    console.log('Making a request for the steam login | session missmatch', this.accountName);
                    let loginStatus = await this.login()
                    if (loginStatus && (!this.config.tradelink || !this.config.steamApiKey) && this.accountName != "table") {
                        let tradelinkStatus = await this.getTradeLink()
                        if (!tradelinkStatus) console.log('Error with receive tradelink', this.accountName);
                        if (receiveApiKey) {
                            let apiKeyStatus = await this.registerApiKey()
                            if (!apiKeyStatus) console.log('Error with receive Steam API Key', this.accountName);
                        }

                        return loginStatus
                    } else {
                        return loginStatus
                    }
                }
            }
        } catch (e) {
            console.log(e);
            if (!tryes) return false
            if (e.message.includes('ECONN') && this.leftLogginAttemptsAmount > 0) {
                console.log(`${this.accountName} | Прокси не работает - ${this.config.proxy}`);
                await this.delay(30e3)
                this.leftLogginAttemptsAmount--
                return this.checkLogin()
            }
        }
    }

    getGuardCode() {
        return SteamTotp.generateAuthCode(this.config.maFile.shared_secret)
    }


    //Steam login
    async login() {
        try {

            let resRsa = await this.s.get({
                url: 'https://steamcommunity.com/login/getrsakey',
                qs: {
                    'donotcache': new Date().getTime() * 1000,
                    'username': this.config.login
                },
                json: true
            })


            var key = new RSA();
            key.setPublic(resRsa.publickey_mod, resRsa.publickey_exp);
            let encryptedPassword = hex2b64(key.encrypt(this.config.password))
            let twoFactorCode = '';

            let resHeaders = await this.s.post({
                url: "https://steamcommunity.com/login/dologin/",
                form: {
                    "donotcache": resRsa.timestamp,
                    "password": encryptedPassword,
                    "username": this.config.login,
                    "captchagid": "-1",
                    "rsatimestamp": resRsa.timestamp,
                    "remember_login": true,
                    "twofactorcode": twoFactorCode,
                    "emailauth": '',
                    "loginfriendlyname": '',
                    "captcha_text": '',
                    "emailsteamid": '',
                },
                json: true,
                resolveWithFullResponse: true,
            })


            if (resHeaders.body.emailauth_needed) {
                let emailAuthCode = readline.question('Enter email confirm-code: ')
                resHeaders = await this.s.post({
                    url: "https://steamcommunity.com/login/dologin/",
                    form: {
                        "donotcache": resRsa.timestamp,
                        "password": encryptedPassword,
                        "username": this.config.login,
                        "captchagid": "-1",
                        "rsatimestamp": resRsa.timestamp,
                        "remember_login": true,
                        "twofactorcode": twoFactorCode,
                        "emailauth": emailAuthCode,
                        "loginfriendlyname": '',
                        "captcha_text": '',
                        "emailsteamid": '',
                    },
                    json: true,
                    resolveWithFullResponse: true,
                })
            }


            let body = resHeaders.body
            return body
        } catch (e) {
            // console.log(e);
            // return
            console.log(e.message);
            if (e.message.includes('ECONN') || e.error.code.includes('ECONN')) {
                console.log(`${this.accountName} | Прокси не работает - ${this.config.proxy} - ${e.error.code} `);
                await this.delay(5e3)
                return this.login()

            }


            return false
        }
    }


    updateConfig() {
        fs.writeFileSync(this.accPath, JSON.stringify(this.config, 0, 4))
    }




}


export default Steam

// module.exports = Steam