/*
 *  Copyright (c) Michael Kolesidis <michael.kolesidis@gmail.com>
 *  GNU Affero General Public License v3.0
 *
 *  ATTENTION! FREE SOFTWARE
 *  This website is free software (free as in freedom).
 *  If you use any part of this code, you must make your entire project's source code
 *  publicly available under the same license. This applies whether you modify the code
 *  or use it as it is in your own project. This ensures that all modifications and
 *  derivative works remain free software, so that everyone can benefit.
 *  If you are not willing to comply with these terms, you must refrain from using any part of this code.
 *
 *  For full license terms and conditions, you can read the AGPL-3.0 here:
 *  https://www.gnu.org/licenses/agpl-3.0.html
 */

import { Fruit } from '../enums';

const segmentToFruit = (reel: number, segment: number) => {
  // ✅ Handle higher segment numbers by using modulo
  const normalizedSegment = segment % 8;
  
  switch (reel) {
    case 0:
      switch (normalizedSegment) {
        case 0:
          return Fruit.cherry;
        case 1:
          return Fruit.lemon;
        case 2:
          return Fruit.lemon;
        case 3:
          return Fruit.banana;
        case 4:
          return Fruit.banana;
        case 5:
          return Fruit.lemon;
        case 6:
          return Fruit.apple;
        case 7:
          return Fruit.lemon;
        default:
          return Fruit.cherry;
      }
    case 1:
      switch (normalizedSegment) {
        case 0:
          return Fruit.lemon;
        case 1:
          return Fruit.lemon;
        case 2:
          return Fruit.banana;
        case 3:
          return Fruit.apple;
        case 4:
          return Fruit.cherry;
        case 5:
          return Fruit.lemon;
        case 6:
          return Fruit.lemon;
        case 7:
          return Fruit.apple;
        default:
          return Fruit.lemon;
      }
    case 2:
      switch (normalizedSegment) {
        case 0:
          return Fruit.lemon;
        case 1:
          return Fruit.lemon;
        case 2:
          return Fruit.banana;
        case 3:
          return Fruit.lemon;
        case 4:
          return Fruit.cherry;
        case 5:
          return Fruit.apple;
        case 6:
          return Fruit.lemon;
        case 7:
          return Fruit.apple;
        default:
          return Fruit.lemon;
      }
    default:
      return Fruit.cherry;
  }
};

export default segmentToFruit;