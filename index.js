import Steam from "./utils/Steam.js";

import fs from "fs"
import got from "got"
import dotenv from "dotenv"
dotenv.config()


const accounts = fs.readFileSync("./data/accounts.txt", "utf-8").split("\n").map(el => el.replace("\r", ""))
let noGuardAccs = []
try {
    noGuardAccs = fs.readFileSync("./data/noGuard.txt", "utf-8").split("\n").map(el => el.replace("\r", ""))
} catch (e) { }

for (let counter = 0; counter < accounts.length; counter++) {
    try {
        const account = accounts[counter]
        let accInfo = {
            login: account.split(":")[0],
            password: account.split(":")[1],
            proxy: process.env.PROXY
        }
        const steam = new Steam(accInfo)
        let loginStatus = await steam.login()

        if (loginStatus.success) {
            if (!noGuardAccs.includes(account)) {
                fs.appendFileSync("./data/noGuard.txt", `${account}\n`)
            }
        } else {
            console.log();
        }
        await got({
            url: `https://mobileproxy.space/reload.html?proxy_key=${process.env.PROXY_KEY}`
        })
    } catch (e) {
        counter--
        console.log(e.message);
    }
}