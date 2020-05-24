import crypto from 'crypto';

let id: Buffer | null = null;

const genId = () => {
  if (!id) {
    id = crypto.randomBytes(20);
    Buffer.from('-AT0001-').copy(id, 0);
  }
  return id;
};

// eslint-disable-next-line import/prefer-default-export
export { genId };
