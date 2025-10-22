import { describe, it, expect, beforeEach } from 'vitest';
import { stringUtf8CV, stringAsciiCV, uintCV, principalCV } from '@stacks/transactions';

const ERR_NOT_AUTHORIZED = 100;
const ERR_TOUR_NOT_FOUND = 101;
const ERR_INVALID_NAME = 102;
const ERR_INVALID_DESCRIPTION = 103;
const ERR_INVALID_HASH = 104;
const ERR_INVALID_PERCENTAGE = 105;
const ERR_MAX_TOURS_EXCEEDED = 106;
const ERR_INVALID_FEE = 107;

interface TourMetadata {
  siteName: string;
  description: string;
  contentHash: string;
  creator: string;
}

interface TourRoyalty {
  recipient: string;
  percentage: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class TourNFTMock {
  state: {
    lastId: number;
    authorityContract: string;
    mintFee: number;
    maxTours: number;
    tourMetadata: Map<number, TourMetadata>;
    tourRoyalties: Map<number, TourRoyalty>;
    owners: Map<number, string>;
  } = {
    lastId: 0,
    authorityContract: 'ST1TEST',
    mintFee: 1000,
    maxTours: 10000,
    tourMetadata: new Map(),
    tourRoyalties: new Map(),
    owners: new Map(),
  };
  caller: string = 'ST1TEST';
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  reset() {
    this.state = {
      lastId: 0,
      authorityContract: 'ST1TEST',
      mintFee: 1000,
      maxTours: 10000,
      tourMetadata: new Map(),
      tourRoyalties: new Map(),
      owners: new Map(),
    };
    this.caller = 'ST1TEST';
    this.stxTransfers = [];
  }

  getLastTokenId(): Result<number> {
    return { ok: true, value: this.state.lastId };
  }

  getTourMetadata(id: number): TourMetadata | null {
    return this.state.tourMetadata.get(id) || null;
  }

  getTourRoyalty(id: number): TourRoyalty | null {
    return this.state.tourRoyalties.get(id) || null;
  }

  getOwner(id: number): Result<string | null> {
    return { ok: true, value: this.state.owners.get(id) || null };
  }

  getMintFee(): Result<number> {
    return { ok: true, value: this.state.mintFee };
  }

  setMintFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newFee < 0) return { ok: false, value: ERR_INVALID_FEE };
    this.state.mintFee = newFee;
    return { ok: true, value: true };
  }

  setAuthorityContract(newAuthority: string): Result<boolean> {
    if (this.caller !== this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.authorityContract = newAuthority;
    return { ok: true, value: true };
  }

  mint(recipient: string, siteName: string, description: string, contentHash: string, royaltyRecipient: string, royaltyPercentage: number): Result<number> {
    if (this.state.lastId >= this.state.maxTours) return { ok: false, value: ERR_MAX_TOURS_EXCEEDED };
    if (!siteName || siteName.length > 100) return { ok: false, value: ERR_INVALID_NAME };
    if (!description || description.length > 500) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!contentHash || contentHash.length > 64) return { ok: false, value: ERR_INVALID_HASH };
    if (royaltyPercentage <= 0 || royaltyPercentage > 100) return { ok: false, value: ERR_INVALID_PERCENTAGE };
    this.stxTransfers.push({ amount: this.state.mintFee, from: this.caller, to: this.state.authorityContract });
    const newId = this.state.lastId + 1;
    this.state.owners.set(newId, recipient);
    this.state.tourMetadata.set(newId, { siteName, description, contentHash, creator: this.caller });
    this.state.tourRoyalties.set(newId, { recipient: royaltyRecipient, percentage: royaltyPercentage });
    this.state.lastId = newId;
    return { ok: true, value: newId };
  }

  transfer(id: number, sender: string, recipient: string): Result<boolean> {
    if (this.caller !== sender) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.owners.has(id)) return { ok: false, value: ERR_TOUR_NOT_FOUND };
    this.state.owners.set(id, recipient);
    return { ok: true, value: true };
  }

  burn(id: number): Result<boolean> {
    if (this.caller !== this.state.owners.get(id)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.owners.has(id)) return { ok: false, value: ERR_TOUR_NOT_FOUND };
    this.state.owners.delete(id);
    this.state.tourMetadata.delete(id);
    this.state.tourRoyalties.delete(id);
    return { ok: true, value: true };
  }

  updateRoyalty(id: number, newRecipient: string, newPercentage: number): Result<boolean> {
    const metadata = this.state.tourMetadata.get(id);
    if (!metadata) return { ok: false, value: ERR_TOUR_NOT_FOUND };
    if (this.caller !== metadata.creator) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newPercentage <= 0 || newPercentage > 100) return { ok: false, value: ERR_INVALID_PERCENTAGE };
    this.state.tourRoyalties.set(id, { recipient: newRecipient, percentage: newPercentage });
    return { ok: true, value: true };
  }
}

describe('TourNFT', () => {
  let contract: TourNFTMock;

  beforeEach(() => {
    contract = new TourNFTMock();
    contract.reset();
  });

  it('mints a tour NFT successfully', () => {
    const result = contract.mint('ST2RECIPIENT', 'Machu Picchu', 'Ancient Incan city', 'ipfs://hash123', 'ST3ROYALTY', 10);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const metadata = contract.getTourMetadata(1);
    expect(metadata?.siteName).toBe('Machu Picchu');
    expect(metadata?.description).toBe('Ancient Incan city');
    expect(metadata?.contentHash).toBe('ipfs://hash123');
    expect(metadata?.creator).toBe('ST1TEST');
    const royalty = contract.getTourRoyalty(1);
    expect(royalty?.recipient).toBe('ST3ROYALTY');
    expect(royalty?.percentage).toBe(10);
    expect(contract.getOwner(1).value).toBe('ST2RECIPIENT');
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: 'ST1TEST', to: 'ST1TEST' }]);
  });

  it('rejects mint with invalid site name', () => {
    const longName = 'A'.repeat(101);
    const result = contract.mint('ST2RECIPIENT', longName, 'Ancient Incan city', 'ipfs://hash123', 'ST3ROYALTY', 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_NAME);
  });

  it('rejects mint with invalid description', () => {
    const longDesc = 'A'.repeat(501);
    const result = contract.mint('ST2RECIPIENT', 'Machu Picchu', longDesc, 'ipfs://hash123', 'ST3ROYALTY', 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DESCRIPTION);
  });

  it('rejects mint with invalid content hash', () => {
    const longHash = 'ipfs://' + 'A'.repeat(60);
    const result = contract.mint('ST2RECIPIENT', 'Machu Picchu', 'Ancient Incan city', longHash, 'ST3ROYALTY', 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it('rejects mint with invalid royalty percentage', () => {
    const result = contract.mint('ST2RECIPIENT', 'Machu Picchu', 'Ancient Incan city', 'ipfs://hash123', 'ST3ROYALTY', 101);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PERCENTAGE);
  });

  it('rejects mint when max tours exceeded', () => {
    contract.state.lastId = 10000;
    const result = contract.mint('ST2RECIPIENT', 'Machu Picchu', 'Ancient Incan city', 'ipfs://hash123', 'ST3ROYALTY', 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_TOURS_EXCEEDED);
  });

  it('transfers NFT successfully', () => {
    contract.mint('ST1TEST', 'Machu Picchu', 'Ancient Incan city', 'ipfs://hash123', 'ST3ROYALTY', 10);
    const result = contract.transfer(1, 'ST1TEST', 'ST4NEW');
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getOwner(1).value).toBe('ST4NEW');
  });

  it('rejects transfer by non-owner', () => {
    contract.mint('ST1TEST', 'Machu Picchu', 'Ancient Incan city', 'ipfs://hash123', 'ST3ROYALTY', 10);
    contract.caller = 'ST5FAKE';
    const result = contract.transfer(1, 'ST1TEST', 'ST4NEW');
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it('rejects transfer for non-existent NFT', () => {
    const result = contract.transfer(99, 'ST1TEST', 'ST4NEW');
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TOUR_NOT_FOUND);
  });

  it('burns NFT successfully', () => {
    contract.mint('ST1TEST', 'Machu Picchu', 'Ancient Incan city', 'ipfs://hash123', 'ST3ROYALTY', 10);
    const result = contract.burn(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getOwner(1).value).toBe(null);
    expect(contract.getTourMetadata(1)).toBe(null);
    expect(contract.getTourRoyalty(1)).toBe(null);
  });

  it('rejects burn by non-owner', () => {
    contract.mint('ST1TEST', 'Machu Picchu', 'Ancient Incan city', 'ipfs://hash123', 'ST3ROYALTY', 10);
    contract.caller = 'ST5FAKE';
    const result = contract.burn(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it('updates royalty successfully', () => {
    contract.mint('ST1TEST', 'Machu Picchu', 'Ancient Incan city', 'ipfs://hash123', 'ST3ROYALTY', 10);
    const result = contract.updateRoyalty(1, 'ST6NEWROYALTY', 20);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const royalty = contract.getTourRoyalty(1);
    expect(royalty?.recipient).toBe('ST6NEWROYALTY');
    expect(royalty?.percentage).toBe(20);
  });

  it('rejects royalty update by non-creator', () => {
    contract.mint('ST1TEST', 'Machu Picchu', 'Ancient Incan city', 'ipfs://hash123', 'ST3ROYALTY', 10);
    contract.caller = 'ST5FAKE';
    const result = contract.updateRoyalty(1, 'ST6NEWROYALTY', 20);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it('rejects royalty update for non-existent NFT', () => {
    const result = contract.updateRoyalty(99, 'ST6NEWROYALTY', 20);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TOUR_NOT_FOUND);
  });

  it('sets mint fee successfully', () => {
    const result = contract.setMintFee(2000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getMintFee().value).toBe(2000);
  });

  it('rejects mint fee update by non-authority', () => {
    contract.caller = 'ST5FAKE';
    const result = contract.setMintFee(2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it('sets authority contract successfully', () => {
    const result = contract.setAuthorityContract('ST7NEW');
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe('ST7NEW');
  });

  it('rejects authority contract update by non-authority', () => {
    contract.caller = 'ST5FAKE';
    const result = contract.setAuthorityContract('ST7NEW');
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });
});