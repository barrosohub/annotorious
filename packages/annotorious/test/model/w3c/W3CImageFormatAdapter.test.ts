import { describe, it, expect } from 'vitest';
import { ShapeType } from '../../../src/model';
import { parseW3CImageAnnotation } from '../../../src/model';

import { annotations } from './fixtures';

describe('parseW3CImageAnnotation', () => {
  it('should parse the sample annotations correctly', () => {
    const parsed = annotations.map(a => parseW3CImageAnnotation(a));

    expect(parsed[0].error).toBe(undefined);
    expect(parsed[1].error).toBe(undefined);

    const [polygon, rectangle] = parsed;

    expect(polygon.parsed.target.selector.type).toBe(ShapeType.POLYGON);
    expect(rectangle.parsed.target.selector.type).toBe(ShapeType.RECTANGLE);
  });
});

