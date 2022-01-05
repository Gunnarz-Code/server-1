const WebSocket = require('ws')
const axios = require('axios')
const { performance } = require('perf_hooks');
const port = 8000
const server = new WebSocket.Server({ port: port });
const password = process.env['password']

var players = []	
var playerIds = []
var maxPop = 64
for (var i = 0; i < maxPop; i++) {
  playerIds.push(i)
}
var apiUrl = 'https://api.nitrogem35.repl.co'
var names = require('./json/names.json').main
var map = require('./json/map-1.json')
var gunStats = require('./json/gunstats.json')
var mapData = {
  'mapLength': 70000,
  'mapWidth': 70000,
  'chunks': []
}
//we split the map into chunks so that
//collisions only need to be checked
//for nearby objects.
var chId = 0
for (var i = 0; i < mapData.mapLength; i += 5000) {
  for (var j = 0; j < mapData.mapWidth; j += 5000) {
    mapData.chunks.push({
      'x': j,
      'y': i,
      'id': chId,
      'objects': []
    })
    chId++
  }
}
for (var i in map) {
  updateChunk(map[i])
}
var tickRate = Math.round(1000 / 30)
var heartbeatInterval = 2000
const loadouts = {
  'guns': [
    0
  ],
  'colors': [
    0, 1, 2, 3, 4, 5, 6, 7, 8
  ],
  'armor': [
    0, 1, 2, 3
  ]
}

const armorStats = {
  '0': {
    'weight': 0
  },
  '1': {
    'weight': 8
  },
  '2': {
    'weight': 15
  },
  '3': {
    'weight': 22
  }
}

var serverData = {
  'population': 0,
  'max': maxPop,
  'region': 'Unknown',
  'city': 'Unknown',
  'type': 'FFA',
  'url': 'sv1.gunnarz.tech',
  'altUrl': 'server-1.nitrogem35.repl.co',
  'id': 1,
  'password': password
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
  'keyup': 11
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

server.on('connection', function connection(ws) {
  if (players.length >= maxPop) {
    kick(ws)
    return
  }

  players.push({
    'socket': ws,
    'gameplayer': {}
  })

  var player = players[players.length - 1]
  initializePlayer(player)

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
    'playing': false,
    'spawned': false,
    'spawning': {
      'is': false
    },
    'username': {
      'guest': true,
      'name': name
    },
    'playerId': null,
    'x': null,
    'y': null,
    'vx': 1366,
    'vy': 768,
    'radius': 20,
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
    'perks': {
      '1': null,
      '2': null,
      '3': null,
      '4': null
    },
    'chunk': null,
    'inView': {
      'obstacles': [],
      'bullets': [],
      'players': []
    }
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
    default:
      kick(player.socket)
      break
  }
}

function handleConnect(player) {
  if(player.gameplayer.playing) kick(player.socket)
  player.gameplayer.playing = true
  player.gameplayer.playerId = playerIds.shift()
  var buf = new ArrayBuffer(1)
  var dv = new DataView(buf)
  dv.setUint8(0, svPacketTypes.joined)
  player.socket.send(buf)
  var buf2 = new ArrayBuffer(2)
  var dv2 = new DataView(buf2)
  dv2.setUint8(0, svPacketTypes.gamemode)
  if(serverData.type == 'FFA') {
    dv2.setUint8(1, 0)
  }
  player.socket.send(buf2)
}

function handleSpawn(player, data) {
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
      gp.armor = data[3]*30
    }
    else {
      kick(player.socket)
    }
  }
  else {
    kick(player.socket)
  }
  player.gameplayer = gp
}

function handleKeyDown(player, data) {
  var code = data[1]
  switch(code) {
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
    default:
      kick(player.socket)
      break
  }
}

function handleKeyUp(player, data) {
  var code = data[1]
  switch(code) {
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
    default:
      kick(player.socket)
      break
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
  if(!player.gameplayer.playing) return
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
  players.splice(players.indexOf(player), 1)
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
      var time = `
        ${dt.getHours()}:${dt.getMinutes()}:${dt.getSeconds()}`
      console.log(`error sending update @${time} UTC`)
    })
}, 2000);

var updatePopulation = setInterval(() => {
  var population = 0
  for (var i in players) {
    if (players[i].gameplayer.playing) population++
  }
  serverData.population = population
}, 1000)

//Game loop
var previousTick = performance.now()
var totalTicks = 0
var gameLoop = function() {
  var now = performance.now()
  totalTicks++
  if (previousTick + tickRate <= now) {
    var time = (now - previousTick) / 1000
    previousTick = now
    update()
    totalTicks = 0
  }
  if (performance.now() - previousTick < tickRate - 16) {
    setTimeout(gameLoop)
  } else {
    setImmediate(gameLoop)
  }
}

//Game logic
var update = function() {
  for (var i in players) {
    if (!players[i].gameplayer.spawning.is) continue
    var p = players[i].gameplayer
    var ps = players[i].socket
    p.invincible = true
    var coords = [Math.round(Math.random()*69000) + 500, Math.round(Math.random()*69000) + 500]
    p.x = coords[0]
    p.y = coords[1]
    p.hp = 100
    p.score = 0
    p.maxAmmo = gunStats[p.gun.toString()].ammo
    p.ammo = p.maxAmmo
    p.maxSpeed = 100 - gunStats[p.gun.toString()].weight - armorStats[p.armor.toString()]
    p.playerAngle = 0
    p.spawning.is = false
    p.spawned = true
    p.chunk = updateChunk(p)
    var spawnPacketBase = new ArrayBuffer(29)
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
    var spawnPacket = appendBuffer(spawnPacketBase, toArrayBuffer(p.username.name))
    ps.send(spawnPacket)
    players[i].gameplayer = p
  }
  for (var i in players) {
    var p = players[i].gameplayer
    if (!p.spawned) continue
    var ps = players[i].socket
    if(p.left && p.x > 500) {
      p.x -= 100
      p.spdX = -100
    }
    if(p.right && p.x < 69500) {
      p.x += 100
      p.spdX = 100
    }
    if(p.up && p.y > 500 ) {
      p.y -= 100
      p.spdY = -100
    }
    if(p.down && p.y < 69500) {
      p.y += 100
      p.spdY = 100
    }
    if(!p.left && !p.right) {
      p.spdX = 0
    }
    if(!p.up && !p.down) {
      p.spdY = 0
    }
    var buf = new ArrayBuffer(11)
    var dv = new DataView(buf)
    dv.setUint8(0, svPacketTypes.stateUpdate)
    dv.setUint32(1, p.x)
    dv.setUint32(5, p.y)
    dv.setUint8(9, p.spdX+128)
    dv.setUint8(10, p.spdY+128)
    ps.send(buf)
    var nearbyObjs = getNearbyObjects(p.x, p.y, p.vx, p.vy)
    p.chunk = updateChunk(p)
    players[i].gameplayer = p
  }
}

function getNearbyObjects(x, y, vx, vy) {
  var nearbyObjects = []
  for(var i in mapData.chunks) {
    if(
      Math.abs(mapData.chunks[i].x)-x > 10000 ||
      Math.abs(mapData.chunks[i].y)-y > 10000
    ) {
      continue
    }
    var chunkObjs = mapData.chunks[i].objects
    for(var j in chunkObjs) {
      if(
        Math.abs(chunkObjs[j].x-x) < vx &&
        Math.abs(chunkObjs[j].y-y) < vy
       ) {
        nearbyObjects.push(chunkObjs[j])
      }
    }
  }
  return nearbyObjects
}

function updateChunk(object) {
  //calculate the chunk id of which chunk the player should be in
  var cx = Math.floor(object.x / 5000) * 5000
  var cy = Math.floor(object.y / 5000) * 5000
  var id = ((cy / 5000) * mapData.mapWidth / 5000) + (cx / 5000)
  //executes code based on type
  //1: crate, 2: longcrate, 3: player 
  if (object.type == 1 || object.type == 2) {
    //appends the object to the list of objects within the chunk
    mapData.chunks[id].objects.push(object)
  }
  if (object.type == 3) {
    if (object.chunk && mapData.chunks[id].id == object.chunk.id) {
      //if the player is inside a chunk, search for it and update it
      var chunkObjs = mapData.chunks[id].objects
      for(var i in chunkObjs) {
        if(chunkObjs[i].playerId == object.playerId) {
          chunkObjs[i] = object
          break
        }
      }
      mapData.chunks[id].objects = chunkObjs
      return mapData.chunks[id]
    }
    else { //if the player is not yet inside a chunk, add it
      mapData.chunks[id].objects.push(object)
      return mapData.chunks[id]
    }
  }
}

gameLoop()