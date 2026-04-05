/**
 * wx-server-sdk Mock for Jest testing
 */

const mockServerDate = jest.fn(() => 'mock-server-date');
const mockCommandSet = jest.fn((data) => data);
const mockWhere = jest.fn();
const mockGet = jest.fn();
const mockDoc = jest.fn();
const mockUpdate = jest.fn();
const mockAdd = jest.fn();
const mockRemove = jest.fn();
const mockOrderBy = jest.fn();
const mockCount = jest.fn();
const mockDeleteFile = jest.fn();

const mockDatabase = jest.fn(() => ({
  collection: jest.fn(() => ({
    where: mockWhere,
    doc: mockDoc,
    add: mockAdd,
    orderBy: mockOrderBy,
  })),
  serverDate: mockServerDate,
  command: {
    set: mockCommandSet,
  },
}));

module.exports = {
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test-env',
  getWXContext: jest.fn(() => ({ OPENID: 'test-openid' })),
  database: mockDatabase,
  deleteFile: mockDeleteFile,
};