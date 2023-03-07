import { search } from '../src';
import { expectError } from './compliance.spec';

describe('Evaluates functions', () => {
  it('group_by()', () => {
    expect(search([], 'group_by(@, &ignored)')).toEqual({});
  });
  it('group_by()', () => {
    const input = {
      items: [
        { spec: { nodeName: 'node_01', other: 'values_01' } },
        { spec: { nodeName: 'node_02', other: 'values_02' } },
        { spec: { nodeName: 'node_03', other: 'values_03' } },
        { spec: { nodeName: 'node_01', other: 'values_04' } },
      ],
    };
    expect(search(input, 'group_by(items, &spec.nodeName)')).toEqual({
      node_01: [
        { spec: { nodeName: 'node_01', other: 'values_01' } },
        { spec: { nodeName: 'node_01', other: 'values_04' } },
      ],
      node_02: [{ spec: { nodeName: 'node_02', other: 'values_02' } }],
      node_03: [{ spec: { nodeName: 'node_03', other: 'values_03' } }],
    });
  });
});

describe('Type-checks function arguments', () => {
  it('group_by()', () => {
    // TODO: should be 'invalid-type'
    expectError(() => {
      return search({}, 'group_by(@, &`false`)');
    }, 'TypeError');
  });
  it('group_by()', () => {
    // TODO: should be 'invalid-type'
    expectError(() => {
      return search([{}, {}], 'group_by(@, &`false`)');
    }, 'TypeError');
  });
});

