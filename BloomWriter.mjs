import { BloomReader } from './BloomReader.mjs';

/**
 * Build Bloom filters that BloomReader can query.
 */
export class BloomWriter extends BloomReader
{
	/**
	 * Allocate a filter for an expected item count and false-positive rate.
	 *
	 * @param {number} capacity Expected number of inserted values.
	 * @param {number} [errorRate] Target false-positive rate.
	 * @returns {BloomWriter} Empty filter with calculated dimensions.
	 */
	static fromCapacity(capacity, errorRate = 0.01)
	{
		if(!Number.isInteger(capacity) || capacity <= 0 ||
			!Number.isFinite(errorRate) || errorRate <= 0 || errorRate >= 1)
		{
			throw new Error('capacity must be a positive integer and errorRate must be between 0 and 1');
		}

		const size = Math.ceil((-capacity * Math.log(errorRate)) / (Math.LN2 ** 2));
		const hashes = Math.max(1, Math.round((size / capacity) * Math.LN2));
		return new this({ size, hashes });
	}

	/**
	 * Add one value to the filter.
	 *
	 * @param {unknown} value Value to add.
	 * @returns {BloomWriter} This writer for method chaining.
	 */
	add(value)
	{
		const [first, second] = this.doubleHashSeeds(String(value));
		for(let index = 0; index < this.k; index++)
		{
			const bit = (first + index * second) % this.m;
			this.setBit(bit);
		}

		this.n += 1;
		return this;
	}

	/**
	 * Remove every value from the filter while retaining its dimensions.
	 *
	 * @returns {void}
	 */
	clear()
	{
		this.bits.fill(0);
		this.n = 0;
	}

	/**
	 * Estimate the current false-positive probability.
	 *
	 * @returns {number} Probability from 0 to 1.
	 */
	estimateFPP()
	{
		return Math.pow(1 - Math.exp(-(this.k * this.n) / this.m), this.k);
	}

	/**
	 * Serialize the filter to a JSON-compatible object.
	 *
	 * @returns {{m: number, k: number, n: number, bitsBase64: string}} Serialized filter.
	 */
	toJSON()
	{
		return {
			m: this.m,
			k: this.k,
			n: this.n,
			bitsBase64: this.u8ToB64(this.bits),
		};
	}

	/**
	 * Serialize the filter to its compact binary representation.
	 *
	 * @returns {Uint8Array} Binary filter data.
	 */
	toBinary()
	{
		const binary = new Uint8Array(12 + this.bits.length);
		const view = new DataView(binary.buffer);
		view.setUint32(0, this.m, true);
		view.setUint32(4, this.k, true);
		view.setUint32(8, this.n, true);
		binary.set(this.bits, 12);
		return binary;
	}

	/**
	 * Set one bit in the filter storage.
	 *
	 * @param {number} index Bit index.
	 * @returns {void}
	 */
	setBit(index)
	{
		const byte = Math.floor(index / 8);
		const mask = 1 << (index % 8);
		this.bits[byte] |= mask;
	}

	/**
	 * Encode filter storage as base64 in browsers and Node.js.
	 *
	 * @param {Uint8Array} bytes Bytes to encode.
	 * @returns {string} Base64 text.
	 */
	u8ToB64(bytes)
	{
		let binary = '';
		for(const byte of bytes)
		{
			binary += String.fromCharCode(byte);
		}

		return btoa(binary);
	}
}
