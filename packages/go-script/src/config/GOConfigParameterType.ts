/**
 * Configuration Parameter Types
 *
 * Defines the type of configuration parameters for validation and help generation.
 */

/**
 * Parameter type for validation and help display
 */
export enum GOConfigParameterType {
  /** String value */
  STRING = 'string',

  /** Integer number */
  INT = 'int',

  /** Floating point number */
  DOUBLE = 'double',

  /** Boolean value */
  BOOL = 'bool',

  /** Array of strings */
  STRING_ARRAY = 'string[]',

  /** Array of integers */
  INT_ARRAY = 'int[]',

  /** Array of doubles */
  DOUBLE_ARRAY = 'double[]',

  /** Array of booleans */
  BOOL_ARRAY = 'bool[]',

  /** Buffer (binary data) */
  BUFFER = 'buffer',

  /** Array of buffers */
  BUFFER_ARRAY = 'buffer[]',
}

/**
 * Get display placeholder for a parameter type
 */
export function getTypePlaceholder(type: GOConfigParameterType): string {
  switch (type) {
    case GOConfigParameterType.STRING:
      return '<value>';
    case GOConfigParameterType.INT:
      return '<number>';
    case GOConfigParameterType.DOUBLE:
      return '<decimal>';
    case GOConfigParameterType.BOOL:
      return '';
    case GOConfigParameterType.STRING_ARRAY:
      return '<value1,value2,...>';
    case GOConfigParameterType.INT_ARRAY:
      return '<num1,num2,...>';
    case GOConfigParameterType.DOUBLE_ARRAY:
      return '<dec1,dec2,...>';
    case GOConfigParameterType.BOOL_ARRAY:
      return '<true,false,...>';
    case GOConfigParameterType.BUFFER:
      return '<base64>';
    case GOConfigParameterType.BUFFER_ARRAY:
      return '<base64,base64,...>';
    default:
      return '<value>';
  }
}
