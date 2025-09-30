import { BloomReader } from "./Reader.mjs";

export class BloomWriter extends BloomReader
{
	static fromCapacity(capacity, errorRate = 0.01)
	{
		if(capacity <= 0 || errorRate <= 0 || errorRate >= 1)
		{
			throw new Error('capacity>0 and 0<errorRate<1 required');
		}

		// m = - (n * ln p) / (ln 2)^2
		const m = Math.ceil((-capacity * Math.log(errorRate)) / (Math.LN2 ** 2));

		// k = (m/n) * ln 2
		const k = Math.max(1, Math.round((m / capacity) * Math.LN2));

		return new this({ size: m, hashes: k });
	}

	add(value)
	{
		const [h1, h2] = this.doubleHashSeeds(String(value));
		for (let i = 0; i < this.k; i++)
		{
			const idx = (h1 + i * h2) % this.m;
			this.setBit(idx);
		}
		this.n++;
		return this;
	}

	clear()
	{
		this.bits.fill(0);
		this.n = 0;
	}

	// Estimated false-positive probability, given current n
	estimateFPP()
	{
		const m = this.m, k = this.k, n = this.n;
		if (m === 0) return 1;
		return Math.pow(1 - Math.exp(-(k * n) / m), k);
	}

	toJSON()
	{
		return {
			m: this.m, k: this.k, n: this.n,
			bitsBase64: this.u8ToB64(this.bits)
		};
	}

	toBinary()
	{
		const bin = new Uint8Array(3 * 4 + this.bits.length);
		const view = new DataView(bin.buffer);

		view.setUint32(0 * 4, this.m, true);
		view.setUint32(1 * 4, this.k, true);
		view.setUint32(2 * 4, this.n, true);

		bin.set(this.bits, 3 * 4);

		return bin;
	}

	// ---------- internals ----------
	setBit(i)
	{
		const byte = (i / 8) | 0;
		const mask = 1 << (i % 8);
		this.bits[byte] |= mask;
	}

	u8ToB64(u8)
	{
		let bin = '';
		for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
		return btoa(bin);
	}
}
