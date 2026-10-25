/**
 * Return a byte view without widening a typed-array slice to its backing buffer.
 *
 * @param {ArrayBuffer | ArrayBufferView} input Binary Bloom filter data.
 * @returns {Uint8Array} A view with the same byte boundaries as the input.
 */
function byteView(input)
{
	if(input instanceof ArrayBuffer)
	{
		return new Uint8Array(input);
	}

	if(ArrayBuffer.isView(input))
	{
		return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
	}

	throw new TypeError('Bloom filter data must be an ArrayBuffer or typed-array view.');
}

/**
 * Query a Bloom filter produced by BloomWriter.
 */
export class BloomReader
{
	/**
	 * Allocate an empty Bloom filter with the requested dimensions.
	 *
	 * @param {{size: number, hashes: number}} options Filter dimensions.
	 */
	constructor({ size, hashes })
	{
		if(!Number.isInteger(size) || size <= 0)
		{
			throw new Error('size must be a positive integer');
		}

		if(!Number.isInteger(hashes) || hashes <= 0 || hashes > size)
		{
			throw new Error('hashes must be a positive integer no greater than size');
		}

		this.m = size;
		this.k = hashes;
		this.bits = new Uint8Array(Math.ceil(size / 8));
		this.n = 0;
	}

	/**
	 * Restore a filter from its JSON representation.
	 *
	 * @param {{m: number, k: number, n?: number, bitsBase64: string}} object Serialized filter.
	 * @returns {BloomReader} Parsed filter.
	 */
	static fromJSON(object)
	{
		if(!object || typeof object !== 'object' || typeof object.bitsBase64 !== 'string')
		{
			throw new TypeError('Invalid Bloom filter JSON.');
		}

		const reader = new this({ size: object.m, hashes: object.k });
		const bits = this.b64ToU8(object.bitsBase64);
		if(bits.byteLength !== reader.bits.byteLength)
		{
			throw new Error('Bloom filter bit length does not match its declared size.');
		}

		if(object.n !== undefined && (!Number.isInteger(object.n) || object.n < 0))
		{
			throw new Error('Bloom filter item count must be a nonnegative integer.');
		}

		reader.n = object.n ?? 0;
		reader.bits = bits;
		return reader;
	}

	/**
	 * Parse the compact binary representation of a Bloom filter.
	 *
	 * @param {ArrayBuffer | ArrayBufferView} input Binary filter data.
	 * @returns {BloomReader} Parsed filter.
	 */
	static fromBinary(input)
	{
		const bytes = byteView(input);
		if(bytes.byteLength < 13)
		{
			throw new Error('Invalid Bloom filter, expected a 12-byte header and filter bits.');
		}

		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const size = view.getUint32(0, true);
		const hashes = view.getUint32(4, true);
		const itemCount = view.getUint32(8, true);
		const expectedBytes = Math.ceil(size / 8);

		if(expectedBytes !== bytes.byteLength - 12)
		{
			throw new Error('Bloom filter bit length does not match its declared size.');
		}

		const reader = new this({ size, hashes });
		reader.n = itemCount;
		reader.bits = bytes.slice(12);
		return reader;
	}

	/**
	 * Test whether a value may be present in the filter.
	 *
	 * @param {unknown} value Candidate value.
	 * @returns {boolean} False when absent and true when possibly present.
	 */
	has(value)
	{
		const [first, second] = this.doubleHashSeeds(String(value));

		for(let index = 0; index < this.k; index++)
		{
			const bit = (first + index * second) % this.m;
			if(!this.getBit(bit))
			{
				return false;
			}
		}

		return true;
	}

	/**
	 * Derive two stable 32-bit seeds for double hashing.
	 *
	 * @param {string} value Value to hash.
	 * @returns {[number, number]} Hash seeds constrained to the filter size.
	 */
	doubleHashSeeds(value)
	{
		const first = this.fnv1a32(value) >>> 0;
		let second = (this.xorshift32(value) | 1) >>> 0;
		if(second === 0)
		{
			second = 1;
		}

		return [first % this.m, second % this.m];
	}

	/**
	 * Calculate an FNV-1a 32-bit hash.
	 *
	 * @param {string} value Value to hash.
	 * @returns {number} Unsigned 32-bit hash.
	 */
	fnv1a32(value)
	{
		let hash = 0x811c9dc5 >>> 0;
		for(const character of value)
		{
			hash ^= character.codePointAt(0);
			hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
		}

		return hash >>> 0;
	}

	/**
	 * Calculate a second 32-bit hash with xorshift mixing.
	 *
	 * @param {string} value Value to hash.
	 * @returns {number} Unsigned 32-bit hash.
	 */
	xorshift32(value)
	{
		let hash = 0x9e3779b9 ^ value.length;
		for(const character of value)
		{
			hash ^= character.codePointAt(0) + 0x7ed55d16 + (hash << 12);
			hash = (hash ^ (hash >>> 19)) >>> 0;
		}

		hash ^= hash << 13;
		hash >>>= 0;
		hash ^= hash >>> 17;
		hash >>>= 0;
		hash ^= hash << 5;
		hash >>>= 0;
		return hash >>> 0;
	}

	/**
	 * Read one bit from the filter storage.
	 *
	 * @param {number} index Bit index.
	 * @returns {boolean} Whether the bit is set.
	 */
	getBit(index)
	{
		const byte = Math.floor(index / 8);
		const mask = 1 << (index % 8);
		return (this.bits[byte] & mask) !== 0;
	}

	/**
	 * Decode base64 filter storage in browsers and Node.js.
	 *
	 * @param {string} base64 Encoded bytes.
	 * @returns {Uint8Array} Decoded bytes.
	 */
	static b64ToU8(base64)
	{
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for(let index = 0; index < binary.length; index++)
		{
			bytes[index] = binary.charCodeAt(index);
		}

		return bytes;
	}
}
