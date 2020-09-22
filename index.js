import varints from 'varint'
import { CID } from 'multiformats/basics'

const cache = new Map()

const varint = {
  decode: data => {
    const code = varints.decode(data)
    return [code, varints.decode.bytes]
  },
  encode: int => {
    if (cache.has(int)) return cache.get(int)
    const buff = Uint8Array.from(varints.encode(int))
    cache.set(int, buff)
    return buff
  }
}

/* TOKENS */

const TYPE_LINK = 0
const TYPE_INTEGER = 1
const TYPE_SIGNED_INTEGER = 2
const TYPE_FLOAT = 3
const TYPE_SIGNED_FLOAT = 4
const TYPE_STRING = 5
const TYPE_BINARY = 6
const TYPE_MAP = 7
const TYPE_LIST = 8
const VALUE_NULL = 9
const VALUE_TRUE = 10
const VALUE_FALSE = 11

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const encodeString = str => textEncoder.encode(str)
const decodeString = b => textDecoder.decode(b)

const vencode = varint.encode
const isFloat = n => Number(n) === n && n % 1 !== 0

const floatToDouble = float => {
  let mantissa = 0
  while (isFloat(float)) {
    float = float * 10
    mantissa += 1
  }
  if (mantissa === 0) throw new Error('Not float')
  return [mantissa, ...vencode(float)]
}

const encoder = obj => {
  if (obj === null) return VALUE_NULL
  if (typeof obj === 'boolean') {
    if (obj) return VALUE_TRUE
    else return VALUE_FALSE
  }
  if (obj instanceof Uint8Array) {
    return [TYPE_BINARY, ...obj]
  }
  if (typeof obj === 'string') {
    return [TYPE_STRING, encodeString(obj)]
  }
  if (obj.asCID === obj) {
    return [TYPE_LINK, ...obj.bytes.byteLength, ...obj.bytes]
  }
  if (typeof obj === 'number') {
    if (isFloat(obj)) {
      if (obj < 0) {
        return [TYPE_SIGNED_FLOAT, ...floatToDouble(obj * -1).flat()]
      } else {
        return [TYPE_FLOAT, ...floatToDouble(obj).flat()]
      }
    } else {
      if (obj < 0) {
        return [TYPE_SIGNED_INTEGER, ...varint(obj * -1)]
      } else {
        return [TYPE_INTEGER, ...varint(obj)]
      }
    }
  }
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      let values = obj.map(o => encoder(obj))
      const lengths = values.map(v => v.length)
      let header = lengths.map(l => vencode(l))
      values = values.flat()
      header = header.flat()
      return [TYPE_LIST, ...vencode(header.length), ...vencode(values.length), ...header, ...values]
    } else {
      let keys = Object.keys(obj).sort()
      let values = keys.map(k => encoder(obj[k]))
      keys = keys.map(k => encodeString(k))
      const valueLengths = values.map(v => vencode(v.length))
      const header = keys.map(k => [...vencode(k.length), ...valueLengths.shift()]).flat()
      keys = keys.flat()
      values = values.flat()
      const lengths = [...vencode(header.length), ...vencode(keys.length), ...vencode(values.length)]
      return [TYPE_MAP, ...lengths, ...header, ...keys, ...values]
    }
  }
}

const parseVarints = bytes => {
  let i = 0
  const ints = []
  while (i < bytes.byteLength) {
    const [int, len] = varint.decode(bytes.subarray(i))
    ints.push(int)
    i += len
  }
  return ints
}

const decoder = (bytes) => {
  let i = 0
  const vdecode = () => {
    const [code, parsed] = varint.decode(bytes.subarray(i))
    i += parsed
    return code
  }
  const parse = l => {
    const b = bytes.subarray(0, l)
    i += l
    return b
  }

  const decodeMap = bytes => {
    const [hlength, klength, vlength] = [vdecode(), vdecode(), vdecode()]
    let [header, keys, values] = [parse(hlength), parse(klength), parse(vlength)]
    let keyIndex = 0
    let valueIndex = 0
    header = parseVarints(header)
    const entries = []
    while (header.length) {
      const [keyLength, valueLength] = header
      header = header.slice(2)
      const key = keys.subarray(keyIndex, keyIndex + keyLength)
      keyIndex += keyLength
      const value = values.subarray(valueIndex, valueIndex + valueLength)
      valueIndex += valueLength
      entries.push([key, decoder(value)])
    }
    return Object.fromEntries(entries)
  }

  const decodeList = bytes => {
    const [hlength, vlength] = [vdecode(), vdecode()]
    let [header, values] = [parse(hlength), parse(vlength)]
    header = parseVarints(header)
    let valueIndex = 0
    const entries = []
    while (header.length) {
      const [valueLength] = header
      header = header.slice(1)
      const value = values.subarray(valueIndex, valueIndex + valueLength)
      valueIndex += valueLength
      entries.push(value)
    }
    return entries.map(value => decoder(value))
  }

  const token = bytes[i]
  i++
  let val
  let length
  let mantissa
  let int
  switch (token) {
    case TYPE_LINK:
      length = vdecode()
      val = CID.from(parse(length))
      break
    case TYPE_INTEGER:
      val = vdecode()
      break
    case TYPE_SIGNED_INTEGER:
      val = -vdecode()
      break
    case TYPE_FLOAT:
      mantissa = bytes[i]
      i++
      int = vdecode()
      val = int / Math.pow(10, mantissa)
      break
    case TYPE_SIGNED_FLOAT:
      mantissa = bytes[i]
      i++
      int = vdecode()
      val = -(int / Math.pow(10, mantissa))
      break
    case TYPE_STRING:
      length = vdecode()
      val = decodeString(parse(length))
      break
    case TYPE_BINARY:
      length = vdecode()
      val = parse(length)
      break
    case TYPE_MAP:
      val = decodeMap()
      break
    case TYPE_LIST:
      val = decodeList()
      break
    case VALUE_NULL:
      val = null
      break
    case VALUE_TRUE:
      val = true
      break
    case VALUE_FALSE:
      val = false
      break
    default:
      throw new Error('UNKNOWN TOKEN: $token')
  }
  if (i < bytes.byteLength) {
    throw new Error('Additional encoded data after value')
  }
  return val
}

const encode = obj => new Uint8Array(encoder(obj))
const decode = bytes => decoder(bytes)

export { encode, decode }
