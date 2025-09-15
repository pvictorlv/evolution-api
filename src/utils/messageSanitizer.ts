import Long from 'long';

/**
 * Utility function to sanitize message content before saving to database
 * Handles Long objects, Buffers, and other non-serializable types from Baileys
 */
export function sanitizeMessageContent(messageContent: any): any {
  try {
    if (!messageContent) return messageContent;

    // Helper function to recursively sanitize objects
    const sanitizeValue = (value: any): any => {
      // Handle null and undefined
      if (value === null || value === undefined) {
        return value;
      }

      // Convert Long objects to numbers
      if (Long.isLong(value)) {
        return value.toNumber();
      }

      // Convert Uint8Array and Buffer to regular arrays for JSON serialization
      if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
        return Array.from(value);
      }

      // Remove functions and other non-serializable objects
      if (typeof value === 'function') {
        return undefined;
      }

      // Handle BigInt
      if (typeof value === 'bigint') {
        return value.toString();
      }

      // Handle Date objects
      if (value instanceof Date) {
        return value.toISOString();
      }

      // Handle objects with toJSON method (but not native types that already work)
      if (value && typeof value === 'object' && typeof value.toJSON === 'function' &&
          !(value instanceof Date) && !(value instanceof String) && !(value instanceof Number)) {
        try {
          return sanitizeValue(value.toJSON());
        } catch (e) {
          // If toJSON fails, continue with regular object handling
        }
      }

      // Handle arrays
      if (Array.isArray(value)) {
        return value.map(item => sanitizeValue(item));
      }

      // Handle regular objects
      if (value && typeof value === 'object') {
        // Check if it's a plain object or built-in type
        const constructor = value.constructor;

        // Handle Map objects
        if (value instanceof Map) {
          const obj: any = {};
          value.forEach((val, key) => {
            obj[key] = sanitizeValue(val);
          });
          return obj;
        }

        // Handle Set objects
        if (value instanceof Set) {
          return Array.from(value).map(item => sanitizeValue(item));
        }

        // For regular objects, recursively sanitize properties
        if (constructor === Object || constructor === undefined || constructor.name === 'Object') {
          const sanitized: any = {};
          for (const [key, val] of Object.entries(value)) {
            const sanitizedValue = sanitizeValue(val);
            if (sanitizedValue !== undefined) {
              sanitized[key] = sanitizedValue;
            }
          }
          return sanitized;
        }

        // For other object types, try to serialize and handle if it fails
        try {
          JSON.stringify(value);
          // If it can be stringified as-is, check if it has nested properties that need sanitization
          if (Object.keys(value).length > 0) {
            const sanitized: any = {};
            for (const [key, val] of Object.entries(value)) {
              const sanitizedValue = sanitizeValue(val);
              if (sanitizedValue !== undefined) {
                sanitized[key] = sanitizedValue;
              }
            }
            return sanitized;
          }
          return value;
        } catch (e) {
          // If it can't be stringified, return a safe representation
          return `[Non-serializable object: ${constructor?.name || 'Unknown'}]`;
        }
      }

      return value;
    };

    return sanitizeValue(messageContent);
  } catch (e) {
    console.error('Error in sanitizeMessageContent:', e);
    return messageContent; // Return original if sanitization fails completely
  }
}
