# simple-dag

Simple DAG is a format for encoding data similar to JSON and CBOR but with
a very different set of priorities.

## Priorities

### 1. IPLD Data Model **Only**

The IPLD Data Model is just JSON types with Binary and a Link (CID) type added.

By exclusively focusing on the IPLD Data Model we ensure that nothing that can't
be represented by the data model will end up in the format and lead to potential
hash consistency issues.

### 2. Consistency (Hash Consistent Roundtrips)

This means that any data encoded with `simple-dag` can be decoded and re-encoded to
the exact same binary representation.

**There is never two ways to encode the same data.**

### 3. Portability

This format should be simple and easy to implement in any programming language.

For example, the following tradeoffs are made:

* All tokens are a full byte so that they are consistent represented by the
same integer in a Uint8Array.
* The entire encoder/decoder is described and implemented as an immutable array
of integers.
* Compactness of the format is often traded for ease and speed of decoding.
  * Termination tokens are never used, instead all parsed is done through length
    prefixing in some form.

### 4. Decode Performance

As long as it doesn't violate any of the prior principals, design decisions are made
that prioritized fast decoding of the format. Tokens and lengths are often encoded
into the format in such a way that a parser can avoid full de-serializations and can
even skip to selected list entries and map keys without fully parsing.

### 5. Encode Performance

Decode is performance is more important, but encode performance is still more important
than other potential priorities like compactness.

# Spec

This format is a series of typing tokens, constant tokens, and inline value data.

Typeing tokens are proceeded with the value data for that type.

Every type value can be parsed knowing only the type and without any outside context
like the container or positional delimiters.

Tokens

| Int | Token |
|---|---|
| 0 | TYPE_LINK |
| 1 | TYPE_INTEGER |
| 2 | TYPE_SIGNED_INTEGER |
| 3 | TYPE_FLOAT |
| 4 | TYPE_SIGNED_FLOAT |
| 5 | TYPE_STRING |
| 6 | TYPE_BINARY |
| 7 | TYPE_MAP |
| 8 | TYPE_LIST |
| 9 | VALUE_NULL |
| 10 | VALUE_TRUE |
| 11 | VALUE_FALSE |

## TYPE_LINK

```
| 0 | VARINT_LENGTH | CID |
```

## TYPE_INTEGER

```
| 1 | VARINT |
```

## TYPE_SIGNED_INTEGER

```
| 2 | VARINT |
```

## TYPE_FLOAT

```
| 3 | MATISSA_LENGTH | VARINT
```

## TYPE_SIGNED_FLOAT

```
| 4 | MATISSA_LENGTH | VARINT
```

## TYPE_STRING

```
| 5 | VARINT_LENGTH | STRING
```

## TYPE_BINARY

```
| 6 | VARINT_LENGTH | BINARY
```

## TYPE_MAP

```
| 7 | HEADER_VARINT_LENGTH | KEYS_VARINT_LENGTH | VALUES_VARINT_LENGTH | HEADER | KEYS | VALUES |
```

There are key sorting rules that must be following. When parsing, if a key does not follow
these sorting rules the decoder MUST throw.

HEADER

The header contains every key and value length. Each pair is written sequentially and must
follow the ordering in the corresponding section (and each section also has strict sorting rules
to ensure determinism).

Every length is a VARINT.

KEYS

* All keys in header must be UTF8 strings
* All keys in header must be sorted following conventional UTF8 string sorting rules
* All keys are written sequentially and can only be parsed by reading the lengths from
the header section.

VALUES

All values are written sequentially based on their corresponding key which is sorted
following UTF8 sorting rules.

## TYPE_LIST

```
| 8 | HEADER_VARINT_LENGTH | VALUES_VARINT_LENGTH | HEADER | VALUES |
```

HEADER

The header contains a list of lengths for every entry in the list.

Since the lenghts are VARINTs you must parse each length in order to determine the size of the array.
While you can skip to different values in the array after parsing the header there it still no way
to skip to parse the length of a particular offset without parsing the entire header. This is another
example of a tradeoff, we're sacrificing decode speed for simplicity and portability.


