// import { CID } from 'multiformats/basics'

// Based on https://github.com/paroga/cbor-js/blob/master/cbor.js
const writeTypeAndLength = (type, length) => {
  if (length < 24) {
    const value = type << 5 | length
    return [value]
  } else if (length < 0x100) {
    const value = type << 5 | 24
    return [value, length]
  } else if (length < 0x10000) {
    const value = type << 5 | 25
    const bytes = new DataView(new ArrayBuffer(2))
    bytes.setUint16(0, length)
    return [value, ...new Uint8Array(bytes.buffer)]
  } else if (length < 0x100000000) {
    const value = type << 5 | 26
    const bytes = new DataView(new ArrayBuffer(4))
    bytes.setUint32(0, length)
    return [value, ...new Uint8Array(bytes.buffer)]
  } else {
    const value = type << 5 | 25
    const bytes = new DataView(new ArrayBuffer(8))
    bytes.setUint64(0, length)
    return [value, ...new Uint8Array(bytes.buffer)]
  }
}

// Based on https://github.com/paroga/cbor-js/blob/master/cbor.js
const readLength = (data, info) => {
  if (info < 24) {
    return [info, 0]
  } else if (info === 24) {
    return [data.getUint8(0), 1]
  } else if (info === 25) {
    return [data.getUint16(0), 2]
  } else if (info === 26) {
    return [data.getUint32(0), 4]
  } else if (info === 27) {
    console.log(data)
    return [data.getBigUint64(0), 8]
  } else {
    throw Error('Invalid length encoding')
  }
}

/* TOKENS */

// const TYPE_LINK = 42
const TYPE_INTEGER = 0
const TYPE_NEGATIVE_INTEGER = 1
const TYPE_FLOAT = 0xfb
const TYPE_STRING = 3
const TYPE_BINARY = 2
const TYPE_MAP = 5
const TYPE_LIST = 4
const VALUE_NULL = 0xf6
const VALUE_TRUE = 0xf5
const VALUE_FALSE = 0xf4

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const encodeString = str => textEncoder.encode(str)
const decodeString = b => textDecoder.decode(b)

const isFloat = n => Number(n) === n && n % 1 !== 0

const encoder = obj => {
  if (obj === null) return [VALUE_NULL]
  if (typeof obj === 'boolean') {
    if (obj) return [VALUE_TRUE]
    else return [VALUE_FALSE]
  }
  if (obj instanceof Uint8Array) {
    return writeTypeAndLength(TYPE_BINARY, obj.length).concat(Array.from(obj))
  }
  if (typeof obj === 'string') {
    const encoded = encodeString(obj)
    return writeTypeAndLength(TYPE_STRING, encoded.length).concat(Array.from(encoded))
  }
  // if (obj.asCID === obj) {
  //  return [TYPE_LINK, ...obj.bytes.byteLength, ...obj.bytes]
  // }
  if (typeof obj === 'number') {
    if (isFloat(obj)) {
      const bytes = new DataView(new ArrayBuffer(8))
      bytes.setFloat64(0, obj)
      return [TYPE_FLOAT, ...new Uint8Array(bytes.buffer)]
    } else {
      if (obj < 0) {
        return writeTypeAndLength(TYPE_NEGATIVE_INTEGER, -(obj + 1))
      } else {
        return writeTypeAndLength(TYPE_INTEGER, obj)
      }
    }
  }
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      const values = obj.map(o => encoder(o))
      return writeTypeAndLength(TYPE_LIST, values.length).concat(values.flat())
    } else {
      const keys = Object.keys(obj).sort()
      const keyValues = keys.map(k => {
        return [encoder(k), encoder(obj[k])].flat()
      })
      return writeTypeAndLength(TYPE_MAP, keys.length).concat(keyValues.flat())
    }
  }
}

const decoder = (bytes) => {
  let i = 0
  const parse = l => {
    const b = bytes.subarray(i, i + l)
    i += l
    return b
  }

  const decodeMap = length => {
    const list = decodeList(length * 2)
    return Object.fromEntries(
      // Based on https://www.w3resource.com/javascript-exercises/fundamental/javascript-fundamental-exercise-265.php
      Array.from({ length }, (_, j) => list.slice(j * 2, j * 2 + 2))
    )
  }

  const decodeList = length => {
    const entries = []
    for (let ii = 0; ii < length; ii++) {
      const [offset, value] = decoder(bytes.subarray(i))
      entries.push(value)
      i += offset
    }
    return entries
  }

  const dataView = () => new DataView(bytes.buffer, bytes.byteOffset + i)

  const token = bytes[i]
  i++
  let val
  switch (token) {
    case VALUE_NULL:
      val = null
      break
    case VALUE_TRUE:
      val = true
      break
    case VALUE_FALSE:
      val = false
      break
    case TYPE_FLOAT:
      val = dataView().getFloat64(0)
      i += 8
      break
    default: {
      const info = token & 0x1f
      const [length, offset] = readLength(dataView(), info)
      i += offset

      const majorType = token >> 5
      switch (majorType) {
        // case TYPE_LINK:
        //  length = vdecode()
        //  val = CID.from(parse(length))
        //  break
        case TYPE_INTEGER:
          val = length
          break
        case TYPE_NEGATIVE_INTEGER:
          val = -1 - length
          break
        case TYPE_STRING:
          val = decodeString(parse(length))
          break
        case TYPE_BINARY:
          val = parse(length)
          break
        case TYPE_MAP:
          val = decodeMap(length)
          break
        case TYPE_LIST:
          val = decodeList(length)
          break
        default:
          throw new Error(`UNKNOWN TOKEN: ${token}`)
      }
    }
  }
  return [i, val]
}

const encode = obj => new Uint8Array(encoder(obj))
const decode = bytes => decoder(bytes)[1]

export { encode, decode }

const hex = (data) => {
  return Array.from(new Uint8Array(data))
    .map(n => n.toString(16).padStart(2, '0'))
    .join(' ')
}

const data = {
  hello: 'world!',
  anarray: [1, 3, 4],
  'with mixed types': [8.2, 1, null, true, false, 'yay'],
  boooool: false,
  nope: null,
  nuuuumbers: 232434,
  nuuuumbersfloat: 342.2134,
  bytes: new Uint8Array([7, 8, 9]),
  nested: {
    amap: 'inhere',
    yay: true,
    araynest: [[[[1, 3]]]]
  }
}
const encoded = encode(data)
console.log(encoded)
console.log(hex(encoded))

const decoded = decode(encoded)
console.log(decoded)
