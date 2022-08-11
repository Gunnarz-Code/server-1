require('dotenv').config()
const WebSocket = require('ws')
const axios = require('axios')
const { performance } = require('perf_hooks')
const { QuadTree, Box, Point, Circle } = require('js-quadtree')
const port = 8000
const server = new WebSocket.Server({ port: port })
const password = process.env['password']
const secretkey = process.env['secretkey']
var players = []
var playerIds = []
var maxPop = 81
var playerPool = [...Array(maxPop)].map(() => ({}))
for (var i = 0; i < maxPop; i++) {
    playerIds.push(i)
}
var bullets = []
var bulletIds = []
var maxBullets = 2000
var bulletPool = [...Array(maxBullets)].map(() => ({}))
for (var i = 0; i < maxBullets; i++) {
    bulletIds.push(i)
}
var apiUrl = 'https://api.nitrogem35.repl.co'
var names = require('./json/names.json').main
var map = require('./json/map-1.json')
var gunStats = require('./json/gunstats.json')
var mapData = {
    'mapLength': 70000,
    'mapWidth': 70000
}
var fogSize = {
    'x': 2000,
    'y': 2000
}
const quadtree = new QuadTree(new Box(0, 0, mapData.mapWidth, mapData.mapLength), {
    arePointsEqual: (point1, point2) => (point1.id === point2.id && point1.type === point2.type)
})
for (var i in map) {
    quadtree.insert({
        'x': map[i].rX || map[i].x,
        'y': map[i].rY || map[i].y,
        'id': map[i].id,
        'orientation': map[i].orientation,
        'type': "object",
        'objType': map[i].type
    })
}
var tickRate = 1000 / 25
var heartbeatInterval = 2000
var tickNum = 0
var scoreReceived = 20
const loadouts = {
    'guns': [
        0
    ],
    'colors': [
        0, 1, 2, 3, 4, 5, 6, 7
    ],
    'armor': [
        0, 1, 2, 3
    ]
}

const armorStats = {
    '0': {
        'weight': 0,
        'health': 0
    },
    '1': {
        'weight': 12,
        'health': 30
    },
    '2': {
        'weight': 22,
        'health': 60
    },
    '3': {
        'weight': 32,
        'health': 90
    }
}

var serverData = {
    'population': 0,
    'max': maxPop,
    'region': null,
    'city': process.env['city'],
    'type': 'FFA',
    'altUrl': process.env['url'],
    'id': process.env['serverId'],
    'password': password
}

const updateTypes = {
    'ext': 1,
    'score': 2,
    'player': 3,
    'playerJoin': 4,
    'playerLeave': 5,
    'objectJoin': 6,
    'objectLeave': 7,
    'serverPopulation': 8,
    'fog': 9,
    'leaderboard': 10,
    'bulletJoin': 11,
    'bulletUpdate': 12,
    'bulletLeave': 13
}

const svPacketTypes = {
    'ping': 1,
    'spawn': 2,
    'stateUpdate': 3,
    'kicked': 4,
    'joined': 5,
    'accountExists': 6,
    'accountExists2': 7,
    'loggedIn': 8,
    'dbOffline': 9,
    'loggedOut': 10,
    'alreadyLoggedIn': 11,
    'invalidCreds': 12,
    'playerJoinScreen': 13,
    'playerUpdate': 14,
    'playerExitScreen': 15,
    'objectJoinScreen': 16,
    'objectExitScreen': 17,
    'gamemode': 18
}

const clPacketTypes = {
    'ping': 1,
    'spawn': 2,
    'logout': 6,
    'login': 7,
    'register': 8,
    'connect': 9,
    'keydown': 10,
    'keyup': 11,
    'chat': 12,
    'mousemove': 13
}

const chatOptions = {
    'open': 1,
    'close': 2,
    'msg': 3
}

const keyCodes = {
    'mouse': 0,
    'left': 1,
    'right': 2,
    'up': 3,
    'down': 4,
    'space': 5,
    'reload': 6
}

for (var i in names) {
    names[i] = {
        name: names[i],
        used: 0
    }
}

server.on('connection', function connection(ws, req) {
    ws.ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    if (players.length >= maxPop) {
        kick(ws)
        return
    }

    var player = {
        'socket': ws,
        'gameplayer': {}
    }

    ws.on('message', function recieve(msg) {
        recieveMsg(player, msg)
    })

    ws.on('close', function onclose() {
        handleOnclose(player)
    })
})


function initializePlayer(player) {
    var name
    for (var i in names) {
        if (names[i].used == 0) {
            names[i].used = 1
            name = names[i].name
            break
        }
    }
    player.gameplayer = {
        'type': 3,
        'playing': true,
        'spawned': false,
        'spawning': {
            'is': false
        },
        'username': {
            'guest': true,
            'name': name
        },
        'playerId': playerIds.shift(),
        'x': null,
        'y': null,
        'vx': 1366,
        'vy': 768,
        'radius': 200,
        'maxSpeed': null,
        'spdX': null,
        'spdY': null,
        'hp': null,
        'invincible': null,
        'gun': null,
        'color': null,
        'armor': null,
        'mouseAngle': 0,
        'score': null,
        'kills': null,
        'mouse': null,
        'up': null,
        'down': null,
        'right': null,
        'left': null,
        'space': null,
        'regenRate': 10,
        'perks': {
            '1': null,
            '2': null,
            '3': null,
            '4': null
        },
        'inView': {
            'obstacles': [],
            'bullets': [],
            'players': []
        },
        'chatboxOpen': false,
        'chatMsg': null,
        'shootingTimeout': 0,
        'reloadingTimeout': 0
    }
}

function recieveMsg(player, msg) {
    var data = new Uint8Array(msg)
    var opcode = data[0]
    switch (opcode) {
        case clPacketTypes.ping:
            player.socket.lastPing = Date.now()
            var buf = new ArrayBuffer(1)
            var dv = new DataView(buf)
            dv.setUint8(0, svPacketTypes.ping)
            setTimeout(() => {
                player.socket.send(buf)
            }, 50)
            break
        case clPacketTypes.spawn:
            handleSpawn(player, data)
            break
        case clPacketTypes.login:
            handleLogin(player, msg)
            break
        case clPacketTypes.register:
            handleRegister(player, msg)
            break
        case clPacketTypes.logout:
            handleLogout(player, msg)
            break
        case clPacketTypes.connect:
            handleConnect(player)
            break
        case clPacketTypes.keydown:
            handleKeyDown(player, data)
            break
        case clPacketTypes.keyup:
            handleKeyUp(player, data)
            break
        case clPacketTypes.chat:
            handleChat(player, msg)
            break
        case clPacketTypes.mousemove:
            handleMouseMove(player, data)
            break
        default:
            var token = new TextDecoder().decode(data)
            axios.post(`https://www.google.com/recaptcha/api/siteverify?secret=${secretkey}&response=${token}&remoteip=${player.socket.ip}`)
                .then(res => {
                    player.socket.sentToken = true
                    if (res.score < 0.7) kick(player.socket)
                })
            break
    }
}

function handleConnect(player) {
    if (player.gameplayer.playing) kick(player.socket)
    players.push(player)
    initializePlayer(player)
    var buf = new ArrayBuffer(1)
    var dv = new DataView(buf)
    dv.setUint8(0, svPacketTypes.joined)
    player.socket.send(buf)
    var buf2 = new ArrayBuffer(2)
    var dv2 = new DataView(buf2)
    dv2.setUint8(0, svPacketTypes.gamemode)
    if (serverData.type == 'FFA') {
        dv2.setUint8(1, 0)
    }
    player.socket.send(buf2)
}

function handleSpawn(player, data) {
    player.socket.sendToken = false
    var gp = player.gameplayer
    if (!gp.spawning.is && !gp.spawned) {
        gp.spawning.is = true
        if (
            typeof loadouts.guns[data[1]] == 'number' &&
            typeof loadouts.colors[data[2]] == 'number' &&
            typeof loadouts.armor[data[3]] == 'number'
        ) {
            gp.gun = data[1]
            gp.color = data[2]
            gp.armorSelection = data[3]
        }
        else {
            kick(player.socket)
        }
    }
    else {
        kick(player.socket)
    }
    setTimeout(() => {
        if (!player.socket.sentToken) kick(player.socket)
    }, 4000)
    player.gameplayer = gp
}

function handleKeyDown(player, data) {
    var code = data[1]
    switch (code) {
        case keyCodes.mouse:
            player.gameplayer.mouse = 1
            break
        case keyCodes.up:
            player.gameplayer.up = 1
            break
        case keyCodes.down:
            player.gameplayer.down = 1
            break
        case keyCodes.left:
            player.gameplayer.left = 1
            break
        case keyCodes.right:
            player.gameplayer.right = 1
            break
        case keyCodes.space:
            player.gameplayer.space = 1
        case keyCodes.reload:
            if (player.gameplayer.ammo < player.gameplayer.maxAmmo) {
                var p = player.gameplayer
                p.reloadingTimeout = gunStats[p.gun].reload
                p.shootingTimeout = 0
            }
            break
        default:
            kick(player.socket)
            break
    }
}

function handleKeyUp(player, data) {
    var code = data[1]
    switch (code) {
        case keyCodes.mouse:
            player.gameplayer.mouse = 0
            break
        case keyCodes.up:
            player.gameplayer.up = 0
            break
        case keyCodes.down:
            player.gameplayer.down = 0
            break
        case keyCodes.left:
            player.gameplayer.left = 0
            break
        case keyCodes.right:
            player.gameplayer.right = 0
            break
        case keyCodes.space:
            player.gameplayer.space = 0
            break
        case keyCodes.reload:
            break
        default:
            kick(player.socket)
            break
    }
}

function handleMouseMove(player, msg) {
    var dv = new DataView(msg.buffer)
    var angle = dv.getUint16(1)
    player.gameplayer.angle = angle
}

function handleChat(player, data) {
    player = player.gameplayer
    var action = data[1]
    if (player.dead) return
    if (action == chatOptions.open) {
        player.oldChatboxOpen = player.chatboxOpen
        player.chatboxOpen = true
    }
    else if (action == chatOptions.close) {
        player.oldChatboxOpen = player.chatboxOpen
        player.chatboxOpen = false
    }
    else if (action == chatOptions.msg) {
        var msg = new TextDecoder().decode(new Uint8Array(data.slice(2)))
        var test = new RegExp('^[\x00-\x7F]*$').test(msg)
        player.oldChatMsg = player.chatMsg
        if (test) player.chatMsg = msg
        else player.chatMsg = "you tried :)"
    }
}

function handleLogin(player, msg) {
    if (player.socket.loggingIn || player.socket.loggedIn) {
        kick(player.socket)
        return
    }
    player.socket.loggingIn = true
    var txtData = new TextDecoder().decode(msg)
    var credentials = txtData.split("\x00")
    credentials[0] = credentials[0].split("\x07")[1]
    var user = credentials[0]
    var pass = credentials[1]
    if (
        (/[^0-9a-z]/gi.test(user) && !/^\S+@\S+\.\S+$/.test(user)) ||
        user.length < 3 ||
        user.length > 64 ||
        user.includes(':') ||
        pass.length < 3 ||
        pass.length > 40 ||
        pass.includes(':')
    ) {
        kick(player.socket)
    }
    else {
        axios.post(
            `${apiUrl}/login`,
            {
                "data": credentials.toString(),
                "server": serverData.id
            }
        )
            .then(res => {
                var $data = res.data.split(",")
                var buf = new ArrayBuffer(1)
                var dv = new DataView(buf)
                if ($data[0] == 'er') {
                    player.socket.loggingIn = false
                    dv.setUint8(0, svPacketTypes.dbOffline)
                    player.socket.send(buf)
                }
                else if ($data[0] == 'ic') {
                    player.socket.loggingIn = false
                    dv.setUint8(0, svPacketTypes.invalidCreds)
                    player.socket.send(buf)
                }
                else if ($data[0] == 'al') {
                    player.socket.loggingIn = false
                    dv.setUint8(0, svPacketTypes.alreadyLoggedIn)
                    player.socket.send(buf)
                }
                else if ($data[0] == 'lg') {
                    player.socket.loggingIn = false
                    player.socket.loggedIn = true
                    player.gameplayer.username.guest = false
                    for (var i in names) {
                        if (names[i].name == player.gameplayer.username.name) {
                            names[i].used = 0
                            break
                        }
                    }
                    player.gameplayer.username.name = $data[1]
                    dv.setUint8(0, svPacketTypes.loggedIn)
                    var userUint8 = new TextEncoder().encode($data[1])
                    var userBuf = userUint8.buffer
                    buf = appendBuffer(buf, userBuf)
                    player.socket.send(buf)
                }
            })
            .catch(error => {
                kick(player.socket)
            })
    }
}

function handleLogout(player, msg) {
    axios.post(
        `${apiUrl}/logout`,
        { "data": player.gameplayer.username.name }
    )
        .then(res => {
            player.socket.loggedIn = false
            var buf = new ArrayBuffer(1)
            var dv = new DataView(buf)
            dv.setUint8(0, svPacketTypes.loggedOut)
            player.socket.send(buf)
            for (var i in names) {
                if (names[i].used == 0) {
                    names[i].used = 1
                    player.gameplayer.username.guest = true
                    player.gameplayer.username.name = names[i].name
                    break
                }
            }
        })
        .catch(error => {
            kick(player.socket)
        })
}

function handleRegister(player, msg) {
    if (player.socket.registering || player.socket.loggedIn) {
        kick(player.socket)
        return
    }
    player.socket.registering = true
    var txtData = new TextDecoder().decode(msg)
    if (((txtData.match(/\x00/g) || []).length) != 2) {
        kick(player.socket)
        return
    }
    var credentials = txtData.split("\x00")
    credentials[0] = credentials[0].split("\x08")[1]
    var user = credentials[0]
    var email = credentials[1]
    var pass = credentials[2]


    if (
        user.length < 3 ||
        user.length > 14 ||
        /[^0-9a-z]/gi.test(user) ||
        !email ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        email.includes(':') ||
        email.length > 64 ||
        pass.length < 3 ||
        pass.length > 40 ||
        pass.includes(':')
    ) {
        kick(player.socket)
        return
    }
    axios.post(
        `${apiUrl}/createAccount`,
        {
            "data": credentials.toString(),
            "server": serverData.id
        }
    )
        .then(res => {
            var $data = res.data.split(",")
            var buf = new ArrayBuffer(1)
            var dv = new DataView(buf)
            if ($data[0] == 'ae') {
                player.socket.registering = false
                dv.setUint8(0, svPacketTypes.accountExists)
                player.socket.send(buf)
            }
            else if ($data[0] == 'ae2') {
                player.socket.registering = false
                dv.setUint8(0, svPacketTypes.accountExists2)
                player.socket.send(buf)
            }
            else if ($data[0] == 'er') {
                player.socket.registering = false
                dv.setUint8(0, svPacketTypes.dbOffline)
                player.socket.send(buf)
            }
            else if ($data[0] == 'lg') {
                player.socket.registering = false
                player.socket.loggedIn = true
                player.gameplayer.username.guest = false
                for (var i in names) {
                    if (names[i].name == player.gameplayer.username.name) {
                        names[i].used = 0
                        break
                    }
                }
                player.gameplayer.username.name = $data[1]
                dv.setUint8(0, svPacketTypes.loggedIn)
                var userUint8 = new TextEncoder().encode($data[1])
                var userBuf = userUint8.buffer
                buf = appendBuffer(buf, userBuf)
                player.socket.send(buf)
            }
        })
        .catch(error => {
            kick(player.socket)
        })
}

function kick(ws) {
    var buf = new ArrayBuffer(1)
    var dv = new DataView(buf)
    dv.setUint8(0, svPacketTypes.kicked)
    ws.send(buf)
    ws.close()
}

function handleOnclose(player) {
    if (!player.gameplayer.playing) return
    playerIds.push(player.gameplayer.playerId)
    if (player.gameplayer.username.guest) {
        for (var i in names) {
            if (names[i].name == player.gameplayer.username.name) {
                names[i].used = 0
                break
            }
        }
    }
    else {
        axios.post(
            `${apiUrl}/logout`,
            { "data": player.gameplayer.username.name }
        )
            .then(res => {

            })
            .catch(error => {

            })
    }
    quadtree.remove({ x: player.gameplayer.x, y: player.gameplayer.y, id: player.gameplayer.playerId, type: "player" })
    players.splice(players.indexOf(player), 1)
    playerPool[player.gameplayer.playerId] = {}
}

function appendBuffer(buffer1, buffer2) {
    var tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength)
    tmp.set(new Uint8Array(buffer1), 0)
    tmp.set(new Uint8Array(buffer2), buffer1.byteLength)
    return tmp.buffer
}

function toArrayBuffer(string) {
    var byteArray = new TextEncoder().encode(string)
    var buffer = byteArray.buffer
    return buffer
}

var sendInfo = setInterval(() => {
    axios.post(
        `${apiUrl}/serverData`,
        serverData
    )
        .then(res => {

        })
        .catch(error => {
            var dt = new Date()
            var time = `${dt.getHours()}:${dt.getMinutes()}:${dt.getSeconds()}`
            console.log(`error sending api update @${time} UTC`)
        })
}, 4000);

var updatePopulation = setInterval(() => {
    var population = 0
    for (var i in players) {
        if (players[i].gameplayer.playing) population++
    }
    serverData.population = population
}, 1000)

//Game loop
var previousTick = performance.now()
var gameLoop = function () {
    var now = performance.now()
    if (previousTick + tickRate <= now) {
        previousTick = now
        update()
    }
    if (performance.now() - previousTick < tickRate - 16) {
        setTimeout(gameLoop)
    } else {
        setImmediate(gameLoop)
    }
}

//Game logic
var update = function () {
    tickNum++
    var oldFogSize = { x: fogSize.x, y: fogSize.y }
    var expectedFogSize = (Math.floor(Math.sqrt(players.length))) * 1000
    if (expectedFogSize < 2000) expectedFogSize = 2000
    if (expectedFogSize > 7000) expectedFogSize = 7000
    if (expectedFogSize > fogSize.x) fogSize.x++
    if (expectedFogSize < fogSize.x) fogSize.x--
    if (expectedFogSize > fogSize.y) fogSize.y++
    if (expectedFogSize < fogSize.y) fogSize.y--
    for (var i in players) {
        if (!players[i].gameplayer.spawning.is) continue
        var p = players[i].gameplayer
        var ps = players[i].socket
        p.invincible = true
        var coords = [32500, 35000]
        p.x = coords[0]
        p.y = coords[1]
        p.spdX = 0
        p.spdY = 0
        p.recoilX = 0
        p.recoilY = 0
        p.hp = 100
        p.maxHp = p.hp
        if(![0, 1, 2, 3].includes(p.armorSelection)) {
          kick(ps)
          return
        }
        p.armor = armorStats[p.armorSelection.toString()].health
        p.maxArmor = p.armor
        p.score = 0
        p.kills = 0
        p.maxAmmo = gunStats[p.gun.toString()].ammo
        p.ammo = p.maxAmmo
        p.maxSpeed = 100 - gunStats[p.gun.toString()].weight - armorStats[p.armorSelection.toString()].weight
        p.maxSpeedD = Math.round(Math.sqrt((p.maxSpeed ** 2) * 2) / 2)
        p.angle = 0
        p.spawning.is = false
        p.spawned = true
        quadtree.insert({
            x: p.x,
            y: p.y,
            id: p.playerId,
            name: (p.username.guest ? 'Guest ' : '') + p.username.name,
            spdX: p.spdX,
            spdY: p.spdY,
            hp: p.hp,
            armor: p.armor,
            color: p.color,
            gun: p.gun,
            radius: p.radius,
            invincible: p.invincible,
            type: "player",
            angle: p.angle
        })
        var spawnPacketBase = new ArrayBuffer(38)
        var dv = new DataView(spawnPacketBase)
        dv.setUint8(0, svPacketTypes.spawn)
        dv.setUint8(1, p.playerId)
        dv.setUint32(2, p.x)
        dv.setUint32(6, p.y)
        dv.setUint8(10, p.hp)
        dv.setUint8(11, p.gun)
        dv.setUint8(12, p.armor)
        dv.setUint8(13, p.color)
        dv.setUint8(14, p.ammo)
        dv.setUint8(15, p.username.guest)
        dv.setUint32(16, mapData.mapWidth)
        dv.setUint32(20, mapData.mapLength)
        dv.setUint16(24, p.vx)
        dv.setUint16(26, p.vy)
        dv.setUint8(28, p.radius)
        dv.setUint8(29, players.length)
        dv.setUint32(30, fogSize.x)
        dv.setUint32(34, fogSize.y)
        var spawnPacket = appendBuffer(spawnPacketBase, toArrayBuffer(p.username.name))
        ps.send(spawnPacket)
        players[i].gameplayer = p
    }
    for (var i in players) {
        var p = players[i].gameplayer
        if (!p.spawned) continue
        playerPool[p.playerId] = p
    }
    applyFogDamage()
    updateBullets()
    createBullets()
    updateScores()
    regenHealth()
    handleDeaths()
    var swappedVelocities = []
    for (var i in players) {
        var p = players[i].gameplayer
        if (!p.spawned || p.dying) continue
        var ps = players[i].socket
        if ((p.left || p.right || p.down || p.up || p.mouse) && p.invincible) {
            p.invincible = false
        }
        //welcome to the land of spaghetti
        if (!p.left || (p.left && p.right)) {
            if (p.spdX < 0) {
                p.spdX -= Math.floor(.0625 * p.spdX) - Math.floor(.03 * p.maxSpeed)
                if (p.spdX > 0) p.spdX = 0
            }
        }
        if (!p.right || (p.right && p.left)) {
            if (p.spdX > 0) {
                p.spdX -= Math.floor(.0625 * p.spdX) + Math.floor(.03 * p.maxSpeed)
                if (p.spdX < 0) p.spdX = 0
            }
        }
        if (!p.down || (p.down && p.up)) {
            if (p.spdY > 0) {
                p.spdY -= Math.floor(.0625 * p.spdY) + Math.floor(.03 * p.maxSpeed)
                if (p.spdY < 0) p.spdY = 0
            }
        }
        if (!p.up || (p.up && p.down)) {
            if (p.spdY < 0) {
                p.spdY -= Math.floor(.0625 * p.spdY) - Math.floor(.03 * p.maxSpeed)
                if (p.spdY > 0) p.spdY = 0
            }
        }
        if (p.left && !(p.down || p.up)) {
            p.spdX -= Math.floor(.125 * (p.maxSpeed + p.spdX)) + Math.floor(.05 * p.maxSpeed)
            if (p.spdX < -p.maxSpeed) p.spdX = -p.maxSpeed
        }
        if (p.right && !(p.down || p.up)) {
            p.spdX += Math.floor(.125 * (p.maxSpeed - p.spdX)) + Math.floor(.05 * p.maxSpeed)
            if (p.spdX > p.maxSpeed) p.spdX = p.maxSpeed
        }
        if (p.up && !(p.left || p.right)) {
            p.spdY -= Math.floor(.125 * (p.maxSpeed + p.spdY)) + Math.floor(.05 * p.maxSpeed)
            if (p.spdY < -p.maxSpeed) p.spdY = -p.maxSpeed
        }
        if (p.down && !(p.left || p.right)) {
            p.spdY += Math.floor(.125 * (p.maxSpeed - p.spdY)) + Math.floor(.05 * p.maxSpeed)
            if (p.spdY > p.maxSpeed) p.spdY = p.maxSpeed
        }
        if (p.down && p.right && !(p.left || p.up)) {
            if (p.spdX < p.maxSpeedD - 5) p.spdX += Math.floor(.125 * (p.maxSpeedD - p.spdX)) + Math.floor(.05 * p.maxSpeedD)
            else if (p.spdX > p.maxSpeedD + 5) p.spdX -= Math.floor(0.5 * p.maxSpeedD)
            else p.spdX = p.maxSpeedD
            if (p.spdY < p.maxSpeedD - 5) p.spdY += Math.floor(.125 * (p.maxSpeedD - p.spdY)) + Math.floor(.05 * p.maxSpeedD)
            else if (p.spdY > p.maxSpeedD + 5) p.spdY -= Math.floor(0.5 * p.maxSpeedD)
            else p.spdY = p.maxSpeedD
        }
        if (p.down && p.left && !(p.right || p.up)) {
            if (p.spdX > -p.maxSpeedD + 5) p.spdX -= Math.floor(.125 * (p.maxSpeedD - p.spdX)) + Math.floor(.05 * p.maxSpeedD)
            else if (p.spdX < -p.maxSpeedD - 5) p.spdX += Math.floor(.05 * p.maxSpeedD)
            else p.spX = -p.maxSpeedD
            if (p.spdY < p.maxSpeedD - 5) p.spdY += Math.floor(.125 * (p.maxSpeedD - p.spdY)) + Math.floor(.05 * p.maxSpeedD)
            else if (p.spdY > p.maxSpeedD + 5) p.spdY -= Math.floor(.05 * p.maxSpeedD)
            else p.spY = p.maxSpeedD
        }
        if (p.up && p.right && !(p.left || p.down)) {
            if (p.spdX < p.maxSpeedD - 5) p.spdX += Math.floor(.125 * (p.maxSpeedD - p.spdX)) + Math.floor(.05 * p.maxSpeedD)
            else if (p.spdX > p.maxSpeedD + 5) p.spdX -= Math.floor(.05 * p.maxSpeedD)
            else p.spdX = p.maxSpeedD
            if (p.spdY > -p.maxSpeedD + 5) p.spdY -= Math.floor(.125 * (p.maxSpeedD - p.spdY)) + Math.floor(.05 * p.maxSpeedD)
            else if (p.spdY < -p.maxSpeedD - 5) p.spdY += Math.floor(.05 * p.maxSpeedD)
            else p.spdY = -p.maxSpeedD
        }
        if (p.up && p.left && !(p.right || p.down)) {
            if (p.spdX > -p.maxSpeedD + 5) p.spdX -= Math.floor(.125 * (p.maxSpeedD - p.spdX)) + Math.floor(.05 * p.maxSpeedD)
            else if (p.spdX < -p.maxSpeedD - 5) p.spdX += Math.floor(.05 * p.maxSpeedD)
            else p.spdX = -p.maxSpeedD
            if (p.spdY > -p.maxSpeedD + 5) p.spdY -= Math.floor(.125 * (p.maxSpeedD - p.spdY)) + Math.floor(.05 * p.maxSpeedD)
            else if (p.spdY < -p.maxSpeedD - 5) p.spdY += Math.floor(.05 * p.maxSpeedD)
            else p.spdY = -p.maxSpeedD
        }

        //check collision with map border
        if (p.x + p.spdX < 0 || p.x + p.spdX > 70000) p.spdX = 0
        if (p.y + p.spdY < 0 || p.y + p.spdY > 70000) p.spdY = 0

        var playersInView = quadtree.query(new Box(p.x - (p.vx * 10 / 2), p.y - (p.vy * 10 / 2), p.vx * 10, p.vy * 10))
        playersInView = playersInView.filter((obj) => { return obj.type == "player" })

        for (var j in playersInView) {
            var player = playersInView[j]
            for (var k = 0; k < players.length; k++) {
                //looping this way is more performant
                if (player.id == players[k].gameplayer.playerId) player = players[k].gameplayer
            }
            if (player.playerId != p.playerId) {
                //make sure velocity isnt swapped twice
                var alreadySwapped = false
                for (var k = 0; k < swappedVelocities.length; k++) {
                    if (swappedVelocities[k].includes(player.playerId) && swappedVelocities[k].includes(p.playerId)) {
                        alreadySwapped = true
                        break
                    }
                }
                if (alreadySwapped) continue
                if (p.radius * 1.05 + player.radius * 1.05 > Math.sqrt((player.x - p.x) ** 2 + (player.y - p.y) ** 2)) {
                    var temp1 = player.spdX
                    var temp2 = player.spdY
                    var temp3 = player.recoilX
                    var temp4 = player.recoilY
                    player.spdX = p.spdX
                    player.spdY = p.spdY
                    player.recoilX = p.recoilX
                    player.recoilY = p.recoilY
                    p.spdX = temp1
                    p.spdY = temp2
                    p.recoilX = temp3
                    p.recoilY = temp4
                    swappedVelocities.push([player.playerId, p.playerId])
                }
            }
        }

        //check collision with rectangles
        for (var j in p.inView.obstacles) {
            var obstacle = map[p.inView.obstacles[j]]
            if (obstacle.type == 1) {
                obstacle.width = 1000
                obstacle.height = 1000
            }
            else if (obstacle.type == 2) {
                if (obstacle.orientation == 1) {
                    obstacle.width = 1000
                    obstacle.height = 500
                }
                else if (obstacle.orientation == 2) {
                    obstacle.width = 500
                    obstacle.height = 1000
                }
            }

            var circleDistance = {
                x: Math.abs((p.x + p.spdX - p.recoilX) - obstacle.x),
                y: Math.abs((p.y + p.spdY - p.recoilY) - obstacle.y)
            }

            var distances = [
                {
                    x: obstacle.x - obstacle.width,
                    y: obstacle.y,
                    name: "left"
                },
                {
                    x: obstacle.x + obstacle.width,
                    y: obstacle.y,
                    name: "right"
                },
                {
                    x: obstacle.x,
                    y: obstacle.y - obstacle.height,
                    name: "top"
                },
                {
                    x: obstacle.x,
                    y: obstacle.y + obstacle.height,
                    name: "bottom"
                }
            ].sort((a, b) => {
                return ((a.x - (p.x + p.spdX - p.recoilX)) ** 2 + (a.y - (p.y + p.spdY - p.recoilY)) ** 2) - ((b.x - (p.x + p.spdX - p.recoilX)) ** 2 + (b.y - (p.y + p.spdY - p.recoilY)) ** 2)
            })

            if (circleDistance.x > (obstacle.width / 2 + p.radius)) continue
            if (circleDistance.y > (obstacle.height / 2 + p.radius)) continue
            if (circleDistance.x <= (obstacle.width / 2 + p.radius / 2)) {
                var newVelocityVec = velocityAfterCollision(p.spdX, p.spdY, distances[0].name)
                p.spdX = newVelocityVec.x
                p.spdY = newVelocityVec.y
                p.recoilX = 0
                p.recoilY = 0
                continue
            }
            if (circleDistance.y <= (obstacle.height / 2 + p.radius / 2)) {
                var newVelocityVec = velocityAfterCollision(p.spdX, p.spdY, distances[0].name)
                p.spdX = newVelocityVec.x
                p.spdY = newVelocityVec.y
                p.recoilX = 0
                p.recoilY = 0
                continue
            }

            var cornerDistanceSquared = (circleDistance.x - obstacle.width / 2) ** 2 + (circleDistance.y - obstacle.height / 2) ** 2
            if (cornerDistanceSquared <= ((p.radius) ** 2)) {
                var newVelocityVec = velocityAfterCollision(p.spdX, p.spdY, distances[0].name)
                p.spdX = newVelocityVec.x
                p.spdY = newVelocityVec.y
                p.recoilX = 0
                p.recoilY = 0
                continue
            }
        }

        quadtree.remove({ x: p.x, y: p.y, id: p.playerId, type: "player" })

        p.x += p.spdX
        p.y += p.spdY
        p.x -= p.recoilX
        p.y -= p.recoilY

        if (p.x < 0) p.x = 0
        if (p.y < 0) p.y = 0
        if (p.x > 70000) p.x = 70000
        if (p.y > 70000) p.y = 70000

        quadtree.insert({
            x: p.x,
            y: p.y,
            id: p.playerId,
            name: (p.username.guest ? 'Guest ' : '') + p.username.name,
            spdX: p.spdX,
            spdY: p.spdY,
            hp: p.hp,
            armor: p.armor,
            color: p.color,
            gun: p.gun,
            radius: p.radius,
            invincible: p.invincible,
            type: "player",
            angle: p.angle
        })

        //if(p.x == 65535) p.x++
        //if(p.y == 65535) p.y++ i'll uncomment these lines if it causes problems
    }
    for (var i in players) {
        var p = players[i].gameplayer
        if (!p.spawned) continue
        var ps = players[i].socket
        var buf = new ArrayBuffer(1)
        var dv = new DataView(buf)
        dv.setUint8(0, svPacketTypes.stateUpdate)
        buf = appendBuffer(buf, buildPlayerPacketMain(p))
        buf = appendBuffer(buf, buildPlayerPacketExt(p))
        buf = appendBuffer(buf, buildPlayersExitingViewPacket(p))
        buf = appendBuffer(buf, buildPlayersInViewPacket(p))
        buf = appendBuffer(buf, buildNewPlayersInViewPacket(p))
        buf = appendBuffer(buf, buildPlayersInViewPacketExt(p))
        buf = appendBuffer(buf, buildObjectsExitingViewPacket(p))
        buf = appendBuffer(buf, buildNewObjectsInViewPacket(p))
        tickNum % 5 == 0 ? buf = appendBuffer(buf, buildPlayersOnlinePacket()) : null
        buf = appendBuffer(buf, buildFogPacket(oldFogSize))
        tickNum % 5 == 0 ? buf = appendBuffer(buf, buildLeaderboardPacket()) : null
        buf = appendBuffer(buf, buildBulletsExitingViewPacket(p))
        buf = appendBuffer(buf, buildBulletsInViewPacket(p))
        buf = appendBuffer(buf, buildNewBulletsInViewPacket(p))
        ps.send(buf)
    }
    for (var i in players) {
        var p = players[i].gameplayer
        if (!p.spawned) continue
        p.oldInvinc = p.invincible
        p.oldHp = p.hp
        p.oldArmor = p.armor
        p.oldChatMsg = p.chatMsg
        p.oldChatboxOpen = p.chatboxOpen
        p.oldScore = p.score
        p.oldRadius = p.radius
        p.oldAmmo = p.ammo
        p.oldReloading = (p.reloadingTimeout > 0)
        p.oldShooting = (p.shootingTimeout != 0)
        if (p.recentlyDied) p.recentlyDied = false
    }
}

function velocityAfterCollision(velocityX, velocityY, side) {
    if (side == "left") {
        return {
            x: -10,
            y: velocityY
        }
    }
    else if (side == "right") {
        return {
            x: 10,
            y: velocityY
        }
    }
    else if (side == "top") {
        return {
            x: velocityX,
            y: -10
        }
    }
    else if (side == "bottom") {
        return {
            x: velocityX,
            y: 10
        }
    }
}

function applyFogDamage() {
    for (var i in players) {
        //check if player is in fog
        var p = players[i].gameplayer
        if (!p.spawned || p.dying || p.invincible) continue
        if (Math.abs(p.x - 35000) > fogSize.x * 10 / 2 || Math.abs(p.y - 35000) > fogSize.y * 10 / 2) {
            if (!p.invincible && p.hp > 0) p.hp -= 1
            if (p.hp <= 0) {
                p.hp = 0
                p.dying = true
            }
        }
    }
}

function updateBullets() {
    for (var i in bullets) {
        quadtree.remove({ x: bullets[i].x, y: bullets[i].y, id: bullets[i].id, type: "bullet" })

        bullets[i].x += bullets[i].spdX
        bullets[i].y += bullets[i].spdY

        var inView = quadtree.query(new Box(bullets[i].x - 500, bullets[i].y - 500, bullets[i].x + 500, bullets[i].y + 500))
        var objectsInView = inView.filter((obj) => obj.type == "object")
        for (var j in objectsInView) {
            var o = objectsInView[j]
            if (o.objType == 1) {
                o.width = 1000
                o.height = 1000
            }
            else if (o.objType == 2) {
                if (o.orientation == 1) {
                    o.width = 1000
                    o.height = 500
                }
                else if (o.orientation == 2) {
                    o.width = 500
                    o.height = 1000
                }
            }
            var intercepts = rectLineIntercepts(o,
                {
                    p1: {
                        x: bullets[i].x,
                        y: bullets[i].y
                    },
                    p2: {
                        x: bullets[i].x + bullets[i].spdX,
                        y: bullets[i].y + bullets[i].spdY
                    }
                }
            )
            if (intercepts.length > 0) {
                bullets[i].intersected = true
            }
        }

        var playersInView = inView.filter((p) => p.type == "player")
        for (var j in playersInView) {
            var p = playerPool[playersInView[j].id]
            if (p.playerId == bullets[i].ownerId || bullets[i].intersected || p.invincible || p.dying) continue
            var lines = {
                p1: {
                    x: bullets[i].x,
                    y: bullets[i].y
                },
                p2: {
                    x: bullets[i].x + bullets[i].spdX,
                    y: bullets[i].y + bullets[i].spdY
                }
            }
            var intercepts = circleLineIntercepts(p, lines)
            if (intercepts.length > 0) {
                var dmg = bullets[i].dmg
                var dmgDealt = 0
                if (p.armor > 0 && p.armor >= dmg && dmgDealt < dmg) {
                    p.armor -= dmg
                    dmgDealt += dmg
                }
                else if (p.armor > 0 && dmgDealt < dmg) {
                    dmgDealt += p.armor
                    p.armor = 0
                }
                if (p.hp > 0 && p.hp >= dmg - dmgDealt && dmgDealt < dmg) {
                    p.hp -= dmg - dmgDealt
                    dmgDealt += dmg - dmgDealt
                }
                else if (p.hp > 0 && dmgDealt < dmg) {
                    dmgDealt += p.hp
                    p.hp = 0
                }
                if (p.hp <= 0) {
                    p.hp = 0
                    p.dying = true
                }
                bullets[i].intersected = true
                playerPool[bullets[i].ownerId].score += dmgDealt
            }
        }

        bullets[i].dmg -= bullets[i].dmgDrop
        bullets[i].ticksTravelled += 1

        if (bullets[i].ticksTravelled >= bullets[i].maxTicks) bullets[i].intersected = true

        if (bullets[i].intersected) {
            bulletPool[bullets[i].id] = {}
            bulletIds.push(bullets[i].id)
            bullets.splice(i, 1)
            continue
        }

        quadtree.insert({ x: bullets[i].x, y: bullets[i].y, id: bullets[i].id, type: "bullet" })
    }
}

function rectLineIntercepts(rect, line) {
    var intercepts = []
    var lines = [
        {
            p1: {
                x: rect.x - rect.width / 2,
                y: rect.y - rect.height / 2
            },
            p2: {
                x: rect.x + rect.width / 2,
                y: rect.y - rect.height / 2
            }
        },
        {
            p1: {
                x: rect.x + rect.width / 2,
                y: rect.y - rect.height / 2
            },
            p2: {
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2
            }
        },
        {
            p1: {
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2
            },
            p2: {
                x: rect.x - rect.width / 2,
                y: rect.y + rect.height / 2
            }
        },
        {
            p1: {
                x: rect.x - rect.width / 2,
                y: rect.y + rect.height / 2
            },
            p2: {
                x: rect.x - rect.width / 2,
                y: rect.y - rect.height / 2
            }
        }
    ]
    for (var i in lines) {
        var intercept = lineIntercept(line, lines[i])
        if (intercept != null) intercepts.push(intercept)
    }
    return intercepts
}

//check if 2 lines intersect
function lineIntercept(line1, line2) {
    var x1 = line1.p1.x
    var y1 = line1.p1.y
    var x2 = line1.p2.x
    var y2 = line1.p2.y
    var x3 = line2.p1.x
    var y3 = line2.p1.y
    var x4 = line2.p2.x
    var y4 = line2.p2.y
    var den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if (den == 0) return null
    var t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    var u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1)
        }
    }
    return null
}

function circleLineIntercepts(circle, line) {
    //credit to Blindman67 on stackoverflow, good time saver, I just tweaked his algorithm a bit
    var a, b, c, d, u1, u2, ret, retP1, retP2, v1, v2
    v1 = {}
    v2 = {}
    v1.x = line.p2.x - line.p1.x
    v1.y = line.p2.y - line.p1.y
    v2.x = line.p1.x - circle.x
    v2.y = line.p1.y - circle.y
    b = (v1.x * v2.x + v1.y * v2.y)
    c = 2 * (v1.x * v1.x + v1.y * v1.y)
    b *= -2
    d = Math.sqrt(b * b - 2 * c * (v2.x * v2.x + v2.y * v2.y - (circle.radius) * (circle.radius)))
    if (isNaN(d)) {
        return []
    }
    u1 = (b - d) / c
    u2 = (b + d) / c
    retP1 = {}
    retP2 = {}
    ret = []
    if (u1 <= 1 && u1 >= 0) {
        retP1.x = line.p1.x + v1.x * u1
        retP1.y = line.p1.y + v1.y * u1
        ret[0] = retP1
    }
    if (u2 <= 1 && u2 >= 0) {
        retP2.x = line.p1.x + v1.x * u2
        retP2.y = line.p1.y + v1.y * u2
        ret[ret.length] = retP2
    }
    return ret
}

function createBullets() {
    for (var i in players) {
        var p = players[i].gameplayer
        if (!p.spawned || p.dying) continue
        var stats = gunStats[p.gun]
        p.recoilX *= 0.85
        p.recoilY *= 0.85
        if (p.recoilX < 1 && p.recoilX > -1) p.recoilX = 0
        if (p.recoilY < 1 && p.recoilY > -1) p.recoilY = 0
        if (p.ammo <= 0 && p.reloadingTimeout <= 0) {
            p.reloadingTimeout = stats.reload
            p.shootingTimeout = 0
            continue
        }
        if (p.reloadingTimeout > 0) {
            p.reloadingTimeout--
            if (p.reloadingTimeout == 0) p.ammo = p.maxAmmo
            else continue
        }
        if (p.shootingTimeout > 0) {
            p.shootingTimeout--
            if (p.shootingTimeout > 0) continue
        }
        if (p.mouse && p.shootingTimeout <= 0) {
            var speed = Math.sqrt((p.spdX - p.recoilX) ** 2 + (p.spdY - p.recoilY) ** 2)
            var varianceFactor = speed === 0 ? 1 : speed > 20 ? 2 : 1.5
            var spread = stats.spread * varianceFactor
            var variation = Math.round(Math.random() * spread - spread / 2)
            var point1 = pointOnCircle(p.x + p.spdX, p.y + p.spdY, p.radius, p.angle - 90)
            var point2 = extend(p.angle + variation, stats.offset, point1.x, point1.y)
            var bulletSpeed = pointOnCircle(0, 0, stats.speed, p.angle + variation)
            var bullet = {
                x: point2.x,
                y: point2.y,
                spdX: bulletSpeed.x,
                spdY: bulletSpeed.y,
                angle: p.angle,
                id: bulletIds.shift(),
                ownerId: p.playerId,
                teamId: p.teamId,
                ticksTravelled: 0,
                maxTicks: stats.travelTime,
                dmg: stats.dmg,
                dmgDrop: stats.dmgDrop,
                bulletType: p.gun,
                bulletWidth: stats.bulletWidth,
                bulletLength: stats.bulletLength
            }
            bullets.push(bullet)
            bulletPool[bullet.id] = bullet
            quadtree.insert({ x: bullet.x, y: bullet.y, id: bullet.id, type: "bullet" })
            p.recoilX = Math.cos((p.angle + variation) * Math.PI / 180) * stats.recoil
            p.recoilY = Math.sin((p.angle + variation) * Math.PI / 180) * stats.recoil
            quadtree.remove({ x: p.x, y: p.y, id: p.playerId, type: "player" })
            p.shootingTimeout = stats.fireRate
            p.ammo--
        }
    }
}

function pointOnCircle(x, y, radius, angle) {
    angle = degsToRads(angle)
    return {
        x: x + radius * Math.cos(angle),
        y: y + radius * Math.sin(angle)
    }
}

function degsToRads(degs) {
    return degs * Math.PI / 180
}

function extend(angle, distance, x, y) {
    var radians = angle * Math.PI / 180;
    return {
        x: x + Math.cos(radians) * distance,
        y: y + Math.sin(radians) * distance
    }
}

function handleDeaths() {
    for (var i in players) {
        var p = players[i].gameplayer
        if (p.dying && p.radius > 0) {
            p.radius -= 8
            if (p.radius <= 8 && !p.dead) {
                p.dead = true
                p.recentlyDied = true
                quadtree.remove({ x: p.x, y: p.y, id: p.playerId, type: "player" })
            }
        }
    }
}

function regenHealth() {
    for (var i in players) {
        var p = players[i].gameplayer
        if (p.dying) continue
        if (p.hp < p.maxHp) {
            if (tickNum % p.regenRate == 0) p.hp += 1
        }
        if (p.armor < p.maxArmor) {
            if (tickNum % 10 == 0) p.armor += 1
        }
    }
}

function buildPlayerPacketMain(p) {
    var buf = new ArrayBuffer(18)
    var dv = new DataView(buf)
    dv.setUint8(0, updateTypes.player)
    dv.setUint8(1, p.playerId)
    dv.setUint32(2, p.x)
    dv.setUint32(6, p.y)
    dv.setUint16(10, p.spdX - p.recoilX + 300)
    dv.setUint16(12, p.spdY - p.recoilY + 300)
    dv.setUint8(14, p.angle)
    dv.setUint16(16, 65535)
    return buf
}

function buildPlayerPacketExt(p) {
    if (
        p.oldInvinc == p.invincible &&
        p.oldHp == p.hp &&
        p.oldArmor == p.armor &&
        p.oldChatboxOpen == p.chatboxOpen &&
        p.oldChatMsg == p.chatMsg &&
        p.oldScore == p.score &&
        p.oldRadius == p.radius &&
        p.oldAmmo == p.ammo &&
        p.oldReloading == (p.reloadingTimeout > 0) &&
        p.oldShooting == (p.shootingTimeout != 0)
    ) {
		return new ArrayBuffer(0)
	} else {
        var buf = new ArrayBuffer(14)
        var dv = new DataView(buf)
        dv.setUint8(0, updateTypes.ext)
        dv.setUint8(1, p.playerId)
        dv.setUint8(2, Number(p.invincible))
        dv.setUint8(3, p.hp)
        dv.setUint8(4, p.armor)
        dv.setUint8(5, Number(p.chatboxOpen))
        dv.setUint32(6, p.score)
        dv.setUint8(10, p.radius)
        dv.setUint8(11, p.ammo)
        dv.setUint8(12, Number(p.reloadingTimeout > 0))
        dv.setUint8(13, Number(p.shootingTimeout != 0))
        if (p.oldChatMsg != p.chatMsg) buf = appendBuffer(buf, toArrayBuffer(p.chatMsg))
        var buf2 = new ArrayBuffer(2)
        var dv2 = new DataView(buf2)
        dv2.setUint16(0, 65535)
        buf = appendBuffer(buf, buf2)
        return buf
    }
}

function buildPlayersInViewPacket(p) {
    var buf = new ArrayBuffer(0)
    var playersInView = quadtree.query(new Box(p.x - (p.vx * 14 / 2), p.y - (p.vy * 14 / 2), p.vx * 14, p.vy * 14))
    playersInView = playersInView.filter((obj) => { return obj.type == "player" })
    for (var i in playersInView) {
        var player = playersInView[i]
        if (player.id == p.playerId || !p.inView.players.includes(player.id)) continue
        var buf2 = new ArrayBuffer(18)
        var dv = new DataView(buf2)
        dv.setUint8(0, updateTypes.player)
        dv.setUint8(1, player.id)
        dv.setUint32(2, player.x)
        dv.setUint32(6, player.y)
        dv.setUint16(10, player.spdX + 300)
        dv.setUint16(12, player.spdY + 300)
        dv.setUint16(14, player.angle)
        dv.setUint16(16, 65535)
        buf = appendBuffer(buf, buf2)
    }
    return buf
}

function buildPlayersInViewPacketExt(p) {
    var buf = new ArrayBuffer(0)
    var playersInView = quadtree.query(new Box(p.x - (p.vx * 14 / 2), p.y - (p.vy * 14 / 2), p.vx * 14, p.vy * 14))
    playersInView = playersInView.filter((obj) => { return obj.type == "player" })
    for (var i in playersInView) {
        var player = playerPool[playersInView[i].id]
        if (player.playerId == p.playerId || !p.inView.players.includes(player.playerId)) continue
        if (
            player.oldInvinc == player.invincible &&
            player.oldHp == player.hp &&
            player.oldArmor == player.armor &&
            player.oldChatboxOpen == player.chatboxOpen &&
            player.oldChatMsg == player.chatMsg &&
            player.oldRadius == player.radius &&
            player.oldReloading == (player.reloadingTimeout > 0) &&
            player.oldShooting == (player.shootingTimeout != 0)
        ) continue
        else {
            var buf2 = new ArrayBuffer(9)
            var dv = new DataView(buf2)
            dv.setUint8(0, updateTypes.ext)
            dv.setUint8(1, player.playerId)
            dv.setUint8(2, Number(player.invincible))
            dv.setUint8(3, player.hp)
            dv.setUint8(4, player.armor)
            dv.setUint8(5, Number(player.chatboxOpen))
            dv.setUint8(6, player.radius)
            dv.setUint8(7, Number(player.reloadingTimeout > 0))
            dv.setUint8(8, Number(player.shootingTimeout != 0))
            if (player.oldChatMsg != player.chatMsg) buf2 = appendBuffer(buf2, toArrayBuffer(player.chatMsg))
            var buf3 = new ArrayBuffer(2)
            var dv2 = new DataView(buf3)
            dv2.setUint16(0, 65535)
            buf2 = appendBuffer(buf2, buf3)
            buf = appendBuffer(buf, buf2)
        }
    }
    return buf
}

function buildNewPlayersInViewPacket(p) {
    var buf = new ArrayBuffer(0)
    var playersInView = quadtree.query(new Box(p.x - (p.vx * 14 / 2), p.y - (p.vy * 14 / 2), p.vx * 14, p.vy * 14))
    playersInView = playersInView.filter((obj) => { return obj.type == "player" })
    for (var i in playersInView) {
        if (playersInView[i].id == p.playerId || p.inView.players.includes(playersInView[i].id)) continue
        p.inView.players.push(playersInView[i].id)
        var buf2 = new ArrayBuffer(23)
        var dv = new DataView(buf2)
        dv.setUint8(0, updateTypes.playerJoin)
        dv.setUint8(1, playersInView[i].id)
        dv.setUint32(2, playersInView[i].x)
        dv.setUint32(6, playersInView[i].y)
        dv.setUint16(10, playersInView[i].spdX + 300)
        dv.setUint16(12, playersInView[i].spdY + 300)
        dv.setUint8(14, playersInView[i].hp)
        dv.setUint8(15, playersInView[i].armor)
        dv.setUint8(16, playersInView[i].gun)
        dv.setUint8(17, playersInView[i].color)
        dv.setUint8(18, playersInView[i].radius)
        dv.setUint8(19, playersInView[i].invincible)
        dv.setUint8(20, playersInView[i].chatboxOpen)
        dv.setUint16(21, playersInView[i].angle)
        buf2 = appendBuffer(buf2, toArrayBuffer(playersInView[i].name))
        var buf3 = new ArrayBuffer(2)
        var dv2 = new DataView(buf3)
        dv2.setUint16(0, 65535)
        buf2 = appendBuffer(buf2, buf3)
        buf = appendBuffer(buf, buf2)
    }
    return buf
}

function buildPlayersExitingViewPacket(p) {
    //remove players that are no longer in view
    var buf = new ArrayBuffer(0)
    var playersInView = quadtree.query(new Box(p.x - (p.vx * 14 / 2), p.y - (p.vy * 14 / 2), p.vx * 14, p.vy * 14))
    playersInView = playersInView.filter((obj) => { return obj.type == "player" })
    var ids = []
    for (var i in playersInView) {
        ids.push(playersInView[i].id)
    }
    for (var i in p.inView.players) {
        var player = playerPool[p.inView.players[i]]
        if (!ids.includes(p.inView.players[i]) || player.recentlyDied) {
            var buf2 = new ArrayBuffer(4)
            var dv = new DataView(buf2)
            dv.setUint8(0, updateTypes.playerLeave)
            dv.setUint8(1, p.inView.players[i])
            dv.setUint16(2, 65535)
            buf = appendBuffer(buf, buf2)
            p.inView.players.splice(i, 1)
        }
    }
    if (p.recentlyDied) {
        var buf2 = new ArrayBuffer(4)
        var dv = new DataView(buf2)
        dv.setUint8(0, updateTypes.playerLeave)
        dv.setUint8(1, p.playerId)
        dv.setUint16(2, 65535)
        buf = appendBuffer(buf, buf2)
    }
    return buf
}

function buildNewObjectsInViewPacket(p) {
    var buf = new ArrayBuffer(0)
    var objectsInView = quadtree.query(new Box(p.x - (p.vx * 14 / 2), p.y - (p.vy * 14 / 2), p.vx * 14, p.vy * 14))
    objectsInView = objectsInView.filter((obj) => { return obj.type == "object" })
    for (var i in objectsInView) {
        if (p.inView.obstacles.includes(objectsInView[i].id)) continue
        p.inView.obstacles.push(objectsInView[i].id)
        var buf2 = new ArrayBuffer(15)
        var dv = new DataView(buf2)
        dv.setUint8(0, updateTypes.objectJoin)
        dv.setUint16(1, objectsInView[i].id)
        dv.setUint32(3, objectsInView[i].x)
        dv.setUint32(7, objectsInView[i].y)
        dv.setUint8(11, objectsInView[i].objType)
        dv.setUint8(12, objectsInView[i].orientation)
        dv.setUint16(13, 65535)
        buf = appendBuffer(buf, buf2)
    }
    return buf
}

function buildObjectsExitingViewPacket(p) {
    var buf = new ArrayBuffer(0)
    var objectsInView = quadtree.query(new Box(p.x - (p.vx * 14 / 2), p.y - (p.vy * 14 / 2), p.vx * 14, p.vy * 14))
    objectsInView = objectsInView.filter((obj) => { return obj.type == "object" })
    var ids = []
    for (var i in objectsInView) {
        ids.push(objectsInView[i].id)
    }
    for (var i in p.inView.obstacles) {
        if (!ids.includes(p.inView.obstacles[i])) {
            var buf2 = new ArrayBuffer(5)
            var dv = new DataView(buf2)
            dv.setUint8(0, updateTypes.objectLeave)
            dv.setUint16(1, p.inView.obstacles[i])
            dv.setUint16(3, 65535)
            buf = appendBuffer(buf, buf2)
            p.inView.obstacles.splice(i, 1)
        }
    }
    return buf
}

function buildNewBulletsInViewPacket(p) {
    var buf = new ArrayBuffer(0)
    var bulletsInView = quadtree.query(new Box(p.x - (p.vx * 14 / 2), p.y - (p.vy * 14 / 2), p.vx * 14, p.vy * 14))
    for (var bulletInView of bulletsInView) {
		if (bulletInView.type != "bullet") continue
        var bullet = bulletPool[bulletInView.id]
        if (p.inView.bullets.includes(bullet.id)) continue
        p.inView.bullets.push(bullet.id)
        var buf2 = new ArrayBuffer(22)
        var dv = new DataView(buf2)
        dv.setUint8(0, updateTypes.bulletJoin)
        dv.setUint16(1, bullet.id)
        dv.setUint32(3, bullet.x)
        dv.setUint32(7, bullet.y)
        dv.setUint16(11, bullet.spdX + 500)
        dv.setUint16(13, bullet.spdY + 500)
        dv.setUint8(15, bullet.bulletType)
        dv.setUint8(16, bullet.bulletWidth)
        dv.setUint8(17, bullet.bulletLength)
        dv.setUint16(18, bullet.angle)
        dv.setUint16(20, 65535)
        buf = appendBuffer(buf, buf2)
    }
    return buf
}

function buildBulletsInViewPacket(p) {
    var buf = new ArrayBuffer(0)
    var bulletsInView = quadtree.query(new Box(p.x - (p.vx * 14 / 2), p.y - (p.vy * 14 / 2), p.vx * 14, p.vy * 14))
    bulletsInView = bulletsInView.filter((obj) => { return obj.type == "bullet" })
    for (var i in bulletsInView) {
        var bullet = bulletPool[bulletsInView[i].id]
        if (!p.inView.bullets.includes(bullet.id)) continue
        var buf2 = new ArrayBuffer(13)
        var dv = new DataView(buf2)
        dv.setUint8(0, updateTypes.bulletUpdate)
        dv.setUint16(1, bullet.id)
        dv.setUint32(3, bullet.x)
        dv.setUint32(7, bullet.y)
        dv.setUint16(11, 65535)
        buf = appendBuffer(buf, buf2)
    }
    return buf
}

function buildBulletsExitingViewPacket(p) {
    var buf = new ArrayBuffer(0)
    var bulletsInView = quadtree.query(new Box(p.x - (p.vx * 14 / 2), p.y - (p.vy * 14 / 2), p.vx * 14, p.vy * 14))
    bulletsInView = bulletsInView.filter((obj) => { return obj.type == "bullet" })
    var ids = []
    for (var i in bulletsInView) {
        ids.push(bulletsInView[i].id)
    }
    for (var i in p.inView.bullets) {
        if (!ids.includes(p.inView.bullets[i])) {
            var buf2 = new ArrayBuffer(5)
            var dv = new DataView(buf2)
            dv.setUint8(0, updateTypes.bulletLeave)
            dv.setUint16(1, p.inView.bullets[i])
            dv.setUint16(3, 65535)
            buf = appendBuffer(buf, buf2)
            p.inView.bullets.splice(i, 1)
        }
    }
    return buf
}

function buildFogPacket(oldFogSize) {
    if (oldFogSize.x == fogSize.x && oldFogSize.y == fogSize.y) return new ArrayBuffer(0)
    var buf = new ArrayBuffer(11)
    var dv = new DataView(buf)
    dv.setUint8(0, updateTypes.fog)
    dv.setUint32(1, fogSize.x)
    dv.setUint32(5, fogSize.y)
    dv.setUint16(9, 65535)
    return buf
}

function buildPlayersOnlinePacket() {
    var buf = new ArrayBuffer(4)
    var dv = new DataView(buf)
    dv.setUint8(0, updateTypes.serverPopulation)
    dv.setUint8(1, players.length)
    dv.setUint16(2, 65535)
    return buf
}

function buildLeaderboardPacket() {
    if (serverData.type == "FFA") {
        var leaderboard = players.sort((a, b) => { return b.score - a.score }).slice(0, 10)
        var buf = new ArrayBuffer(1)
        var dv = new DataView(buf)
        dv.setUint8(0, updateTypes.leaderboard)
        var leaderboardStr = ""
        for (var i in leaderboard) {
            var p = leaderboard[i].gameplayer
            if (!p.spawned || p.hp <= 0) continue
            var name = (p.username.guest ? 'Guest ' : '') + p.username.name
            leaderboardStr += `|${name},${p.score},${p.kills},${p.playerId}`
        }
        buf = appendBuffer(buf, toArrayBuffer(leaderboardStr))
        var buf2 = new ArrayBuffer(2)
        var dv2 = new DataView(buf2)
        dv2.setUint16(0, 65535)
        buf = appendBuffer(buf, buf2)
        return buf
    }
}

function updateScores() {
    if (tickNum % 25 != 0) return
    if (serverData.type == "FFA") {
        var centerSquare = {
            x: mapData.mapWidth / 2 - 2000 / 2,
            y: mapData.mapLength / 2 - 2000 / 2
        }
        var playersAtCenter = quadtree.query(new Box(centerSquare.x, centerSquare.y, 2000, 2000))
        playersAtCenter = playersAtCenter.filter((obj) => { return obj.type == "player" })
        var scorePerPlayer = Math.ceil(scoreReceived / playersAtCenter.length)
        for (var i in playersAtCenter) {
            var player = playerPool[playersAtCenter[i].id]
            player.score += scorePerPlayer
        }
    }
}

gameLoop()