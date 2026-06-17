---
name: web-scraper
description: Scrape, crawl, and extract data from websites. Use when users ask to scrape web pages, extract content, crawl websites, or collect data from the internet.
---

# Web Scraper

## Overview
Extract content and data from websites using various techniques including crawling, scraping, and structured data extraction.

## When to Use
- Extract text content from web pages
- Crawl entire websites
- Collect structured data
- Research and gather information
- Monitor website changes
- Extract tables and lists

## Tools Available

### Content Extraction
```javascript
// Use extract_content_from_websites for structured extraction
// Supports batch processing of multiple URLs
// Returns JSON format with extracted content
```

### Task Format
```javascript
{
    tasks: [
        {
            url: "https://example.com",
            prompt: "Extract specific information",
            task_name: "optional_name"
        }
    ]
}
```

## Usage Patterns

### Simple Content Extraction
```javascript
// Extract main content from a page
const result = await extract_content_from_websites({
    tasks: [{
        url: "https://news.example.com/article",
        prompt: "Extract the title, author, date, and main content"
    }]
});
```

### Batch URL Processing
```javascript
// Process multiple URLs in parallel
const urls = [
    "https://site.com/page1",
    "https://site.com/page2",
    "https://site.com/page3"
];

const results = await extract_content_from_websites({
    tasks: urls.map((url, i) => ({
        url,
        prompt: "Extract all product information, prices, and descriptions",
        task_name: `product_${i}`
    }))
});
```

### Data Mining
```javascript
// Extract structured data like prices, reviews, specifications
const data = await extract_content_from_websites({
    tasks: [{
        url: "https://ecommerce.example.com/products",
        prompt: "Extract product name, price, rating, and availability for all products listed"
    }]
});
```

## Extraction Modes

### Auto Mode (Default)
- Attempts HTTP GET first
- Falls back to browser rendering for CSR pages
- Best for most websites

### Curl Only Mode
- Fast direct HTTP requests
- Best for static HTML pages
- May fail on JavaScript-heavy sites

### Browser Only Mode
- Full browser rendering
- Handles dynamic content
- Slower but more comprehensive

## Best Practices
1. Start with simpler extraction before complex patterns
2. Use specific prompts for targeted data
3. Respect website terms of service
4. Add delays between requests when scraping multiple pages
5. Handle errors gracefully with try/catch

## Data Handling
- Returns JSON format for easy processing
- Handles batch operations efficiently
- Supports pagination when needed
- Maintains data structure in results
