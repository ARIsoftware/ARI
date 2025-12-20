import { createDbClient } from './db'

interface Quote {
  id: string
  quote: string
  author?: string | null
}

export async function getRandomQuote(userId: string): Promise<Quote | null> {
  try {
    const supabase = createDbClient()

    // Fetch all quotes for the user
    const { data: quotes, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('user_id', userId)

    if (error) {
      console.error('Error fetching quotes:', error)
      return null
    }

    if (!quotes || quotes.length === 0) {
      return null
    }

    // Select a random quote
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)]
    return randomQuote as Quote
  } catch (error) {
    console.error('Error in getRandomQuote:', error)
    return null
  }
}
