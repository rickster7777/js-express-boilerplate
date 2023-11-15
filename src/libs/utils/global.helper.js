import validator from 'validator';

/**
 * It takes an email address and normalizes it to a standard format
 * @param value - The email address to normalize.
 * @returns A normalized email address.
 */
export const normalizeEmail = async (value) =>
    validator.normalizeEmail(value, {
        all_lowercase: true,
        gmail_remove_dots: true,
        gmail_remove_subaddress: true,
        gmail_convert_googlemaildotcom: true,
        outlookdotcom_remove_subaddress: true,
        yahoo_remove_subaddress: true,
        icloud_remove_subaddress: true,
    });
