/**
 * Date & File Size Formatting Utilities
 * 
 * Reusable formatting functions for displaying dates and file sizes in the UI
 * All functions handle edge cases and invalid inputs gracefully
 */

/**
 * Format ISO date string to short date format
 * 
 * Example: "2025-12-30T12:26:00Z" → "Dec 30, 2025"
 * 
 * @param {string|Date} dateInput - ISO date string or Date object
 * @returns {string} - Formatted date like "Dec 30, 2025"
 */
export function formatDateShort(dateInput) {
  try {
    if (!dateInput) {
      return 'Unknown date'
    }

    // Parse date
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput

    // Validate date
    if (isNaN(date.getTime())) {
      console.warn('Invalid date input:', dateInput)
      return 'Invalid date'
    }

    // Format using Intl API for locale-aware formatting
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date)
  } catch (err) {
    console.error('Error formatting date:', err)
    return 'Invalid date'
  }
}

/**
 * Format ISO date string to full date and time format
 * 
 * Example: "2025-12-30T12:26:00Z" → "Dec 30, 2025 at 12:26 PM"
 * 
 * @param {string|Date} dateInput - ISO date string or Date object
 * @returns {string} - Formatted date and time like "Dec 30, 2025 at 12:26 PM"
 */
export function formatDateTime(dateInput) {
  try {
    if (!dateInput) {
      return 'Unknown date'
    }

    // Parse date
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput

    // Validate date
    if (isNaN(date.getTime())) {
      console.warn('Invalid date input:', dateInput)
      return 'Invalid date'
    }

    // Format date part
    const dateStr = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date)

    // Format time part
    const timeStr = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date)

    return `${dateStr} at ${timeStr}`
  } catch (err) {
    console.error('Error formatting date and time:', err)
    return 'Invalid date'
  }
}

/**
 * Format date as relative time (e.g., "2 hours ago", "3 days ago")
 * 
 * Examples:
 * - "30 seconds ago" (within 1 minute)
 * - "5 minutes ago"
 * - "2 hours ago"
 * - "3 days ago"
 * - "2 months ago"
 * 
 * @param {string|Date} dateInput - ISO date string or Date object
 * @returns {string} - Relative time like "2 hours ago"
 */
export function formatRelativeTime(dateInput) {
  try {
    if (!dateInput) {
      return 'Unknown time'
    }

    // Parse date
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput

    // Validate date
    if (isNaN(date.getTime())) {
      console.warn('Invalid date input:', dateInput)
      return 'Invalid date'
    }

    // Calculate time difference in milliseconds
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()

    // Handle future dates
    if (diffMs < 0) {
      return 'in the future'
    }

    // Time unit conversions
    const seconds = Math.floor(diffMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    const weeks = Math.floor(days / 7)
    const months = Math.floor(days / 30)
    const years = Math.floor(days / 365)

    // Return appropriate time unit
    if (seconds < 60) {
      return seconds === 1 ? '1 second ago' : `${seconds} seconds ago`
    }

    if (minutes < 60) {
      return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
    }

    if (hours < 24) {
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`
    }

    if (days < 7) {
      return days === 1 ? '1 day ago' : `${days} days ago`
    }

    if (weeks < 4) {
      return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
    }

    if (months < 12) {
      return months === 1 ? '1 month ago' : `${months} months ago`
    }

    return years === 1 ? '1 year ago' : `${years} years ago`
  } catch (err) {
    console.error('Error formatting relative time:', err)
    return 'Unknown time'
  }
}

/**
 * Format file size in bytes to human-readable format
 * 
 * Examples:
 * - 512 → "512 B"
 * - 1536 → "1.5 KB"
 * - 2621440 → "2.5 MB"
 * - 1073741824 → "1 GB"
 * 
 * @param {number} bytes - Size in bytes
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} - Formatted size like "2.5 MB"
 */
export function formatFileSize(bytes, decimals = 1) {
  try {
    // Validate input
    if (typeof bytes !== 'number' || bytes < 0) {
      console.warn('Invalid bytes input:', bytes)
      return '0 B'
    }

    // Handle zero bytes
    if (bytes === 0) {
      return '0 B'
    }

    // Validate decimals
    if (typeof decimals !== 'number' || decimals < 0) {
      decimals = 1
    }

    // Size units
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    const k = 1024

    // Find appropriate unit
    let unitIndex = 0
    let size = bytes

    while (size >= k && unitIndex < units.length - 1) {
      size /= k
      unitIndex++
    }

    // Format with decimals
    const formatted = unitIndex === 0 ? size : size.toFixed(decimals)

    return `${formatted} ${units[unitIndex]}`
  } catch (err) {
    console.error('Error formatting file size:', err)
    return 'Unknown size'
  }
}

/**
 * Format duration in seconds to human-readable format
 * 
 * Examples:
 * - 45 → "45 seconds"
 * - 120 → "2 minutes"
 * - 3661 → "1 hour, 1 minute"
 * - 90061 → "1 day, 1 hour"
 * 
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration like "2 minutes"
 */
export function formatDuration(seconds) {
  try {
    // Validate input
    if (typeof seconds !== 'number' || seconds < 0) {
      console.warn('Invalid seconds input:', seconds)
      return '0 seconds'
    }

    if (seconds === 0) {
      return '0 seconds'
    }

    // Time conversions
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    // Build parts array
    const parts = []

    if (days > 0) {
      parts.push(`${days} day${days !== 1 ? 's' : ''}`)
    }

    if (hours > 0) {
      parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`)
    }

    if (minutes > 0) {
      parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`)
    }

    if (secs > 0 || parts.length === 0) {
      parts.push(`${secs} second${secs !== 1 ? 's' : ''}`)
    }

    // Join with commas, last item with "and"
    if (parts.length === 1) {
      return parts[0]
    }

    if (parts.length === 2) {
      return parts.join(' and ')
    }

    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]
  } catch (err) {
    console.error('Error formatting duration:', err)
    return 'Unknown duration'
  }
}

/**
 * Format number with thousand separators
 * 
 * Examples:
 * - 1000 → "1,000"
 * - 1234567 → "1,234,567"
 * 
 * @param {number} num - Number to format
 * @returns {string} - Formatted number like "1,234,567"
 */
export function formatNumber(num) {
  try {
    if (typeof num !== 'number') {
      console.warn('Invalid number input:', num)
      return '0'
    }

    return new Intl.NumberFormat('en-US').format(num)
  } catch (err) {
    console.error('Error formatting number:', err)
    return String(num)
  }
}

/**
 * Format large numbers with abbreviations
 * 
 * Examples:
 * - 1000 → "1K"
 * - 1500000 → "1.5M"
 * - 2000000000 → "2B"
 * 
 * @param {number} num - Number to format
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} - Formatted number like "1.5M"
 */
export function formatNumberAbbrev(num, decimals = 1) {
  try {
    // Validate input
    if (typeof num !== 'number' || num < 0) {
      console.warn('Invalid number input:', num)
      return '0'
    }

    if (num < 1000) {
      return String(num)
    }

    const suffixes = ['', 'K', 'M', 'B', 'T']
    let suffixIndex = 0
    let size = num

    while (size >= 1000 && suffixIndex < suffixes.length - 1) {
      size /= 1000
      suffixIndex++
    }

    const formatted = suffixIndex === 0 ? size : size.toFixed(decimals)
    return `${formatted}${suffixes[suffixIndex]}`
  } catch (err) {
    console.error('Error formatting number abbreviation:', err)
    return String(num)
  }
}

/**
 * Get time zone offset string
 * 
 * Examples:
 * - "UTC-5" (EST)
 * - "UTC+1" (CET)
 * 
 * @returns {string} - Current timezone offset like "UTC-5"
 */
export function getTimezoneOffset() {
  try {
    const date = new Date()
    const offset = -date.getTimezoneOffset() / 60
    const sign = offset >= 0 ? '+' : ''
    return `UTC${sign}${offset}`
  } catch (err) {
    console.error('Error getting timezone offset:', err)
    return 'UTC'
  }
}

/**
 * Format date for ISO string input (HTML date inputs)
 * 
 * @param {string|Date} dateInput - ISO date string or Date object
 * @returns {string} - ISO string without time (YYYY-MM-DD)
 */
export function formatDateForInput(dateInput) {
  try {
    if (!dateInput) {
      return ''
    }

    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput

    if (isNaN(date.getTime())) {
      return ''
    }

    // Return YYYY-MM-DD format
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  } catch (err) {
    console.error('Error formatting date for input:', err)
    return ''
  }
}
