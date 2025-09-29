export class BloomReader
{
	constructor({ size, hashes })
	{
		if (!Number.isInteger(size) || size <= 0) throw new Error('size must be > 0');
		if (!Number.isInteger(hashes) || hashes <= 0) throw new Error('hashes must be > 0');
		this.m = size;           // number of bits
		this.k = hashes;         // number of hash probes
		this.bits = new Uint8Array(Math.ceil(size / 8));
		this.n = 0;              // items added (for FPP estimate)
	}

	static fromJSON(obj)
	{
		const bf = new this({ size: obj.m, hashes: obj.k });
		bf.n = obj.n || 0;
		bf.bits = this.b64ToU8(obj.bitsBase64);
		return bf;
	}

	has(value)
	{
		const [h1, h2] = this.doubleHashSeeds(String(value));
		for (let i = 0; i < this.k; i++)
		{
			const idx = (h1 + i * h2) % this.m;
			if (!this.getBit(idx)) return false;   // definitely not present
		}
		return true;                               // possibly present
	}

	// Double hashing: h_i = (h1 + i*h2) mod m
	doubleHashSeeds(str)
	{
		const h1 = this.fnv1a32(str);
		// Make h2 odd & non-zero (better cycle through bit array)
		let h2 = this.xorshift32(str) | 1;
		if (h2 === 0) h2 = 1;
		// Keep within 32-bit unsigned range
		return [h1 % this.m, h2 % this.m];
	}

	// FNV-1a 32-bit
	fnv1a32(str)
	{
		let h = 0x811c9dc5 >>> 0;
		for (const ch of str)
		{
			h ^= ch.codePointAt(0);
			// h *= 16777619 (via shifts to stay in 32-bit)
			h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
		}
		return h >>> 0;
	}

	// Lightweight second hash (xorshift on a simple mixing of codepoints)
	xorshift32(str)
	{
		let x = 0x9e3779b9 ^ str.length;
		for (const ch of str)
		{
			x ^= ch.codePointAt(0) + 0x7ed55d16 + (x << 12);
			x = (x ^ (x >>> 19)) >>> 0;
		}
		// xorshift32 step
		x ^= x << 13; x >>>= 0;
		x ^= x >>> 17; x >>>= 0;
		x ^= x << 5;  x >>>= 0;
		return x >>> 0;
	}

	getBit(i)
	{
		const byte = (i / 8) | 0;
		const mask = 1 << (i % 8);
		return (this.bits[byte] & mask) !== 0;
	}

	static b64ToU8(b64)
	{
		const bin = atob(b64);
		const u8 = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
		return u8;
	}
}
