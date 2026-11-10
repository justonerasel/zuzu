import type { PersonalityId, VoiceIdentity, UserMemory } from '../types/index.ts';

export interface GenerateResponseOptions {
  userQuestion: string;
  conversationHistory: Array<{ sender: 'user' | 'assistant'; text: string }>;
  personality: PersonalityId;
  voiceIdentity: VoiceIdentity;
  customPersonalityPrompt?: string;
  isVoiceMode?: boolean;
  memories?: UserMemory[];
  memoryEnabled?: boolean;
}

/**
 * Intelligent Conversational Engine that provides comprehensive, rich,
 * contextual answers tailored to Zuzu AI's identity, gender, and personalities.
 */
export function generateIntelligentAnswer(options: GenerateResponseOptions): string {
  const {
    userQuestion,
    personality = 'Normal',
    voiceIdentity = 'male',
    customPersonalityPrompt = '',
    isVoiceMode = false,
    memories = [],
    memoryEnabled = true
  } = options;

  const q = userQuestion.trim();
  const lower = q.toLowerCase();
  const identityName = voiceIdentity === 'female' ? 'Female Zuzu' : 'Male Zuzu';

  const isBengali = /[\u0980-\u09FF]/.test(q);

  // 0. Long-Term Memory Inquiries & Recall
  if (memoryEnabled && memories && memories.length > 0) {
    // A. "What is my name?" / "আমার নাম কী?"
    if (
      lower.includes('what is my name') || 
      lower.includes("what's my name") || 
      lower.includes('do you know my name') ||
      /আমার নাম কি/i.test(q) ||
      /আমার নাম কী/i.test(q) ||
      /আমি কে/i.test(q) ||
      lower === 'who am i'
    ) {
      const nameMem = memories.find(m => 
        /name|username|user/i.test(m.key) || /নাম/i.test(m.key)
      );
      if (nameMem) {
        if (isBengali) {
          return `আমার স্মৃতি অনুযায়ী আপনার নাম হলো **${nameMem.value}**। আমি আপনার পছন্দ ও তথ্য আমার লং-টার্ম মেমোরিতে নিরাপদে সংরক্ষণ করে রেখেছি।`;
        }
        return `According to my long-term memory, your name is **${nameMem.value}**! I have this saved in your personal memory profile.`;
      }
    }

    // B. "What do you know / remember about me?" / "আমার সম্পর্কে কী মনে রেখেছো?"
    if (
      lower.includes('what do you remember') ||
      lower.includes('what do you know about me') ||
      lower.includes('my memories') ||
      lower.includes('list my memories') ||
      /আমার সম্পর্কে কি জানো/i.test(q) ||
      /আমার সম্পর্কে কী জানো/i.test(q) ||
      /তোমার কি মনে আছে/i.test(q) ||
      /আমার স্মৃতি/i.test(q)
    ) {
      if (isBengali) {
        const memList = memories.map((m, idx) => `${idx + 1}. **${m.key}**: ${m.value}`).join('\n');
        return `আমার দীর্ঘমেয়াদী স্মৃতিতে আপনার সম্পর্কে এই তথ্যগুলো সংরক্ষিত রয়েছে:\n\n${memList}\n\nআপনি চাইলে সেটিংসের **Memory** সেকশন থেকে যেকোনো সময় এগুলো দেখতে, সম্পাদনা করতে বা মুছে ফেলতে পারেন।`;
      }

      const memList = memories.map((m, idx) => `• **${m.key}**: ${m.value}`).join('\n');
      return `Here is what I currently remember about you in my local long-term memory:\n\n${memList}\n\nYou can review, edit, or delete any of these anytime from the **Memory Settings** tab.`;
    }
  }

  // 0.1 Explicit Remember Request
  if (
    lower.startsWith('remember that') ||
    lower.startsWith('remember this') ||
    lower.startsWith('remember:') ||
    lower.startsWith('please remember') ||
    /মনে রেখো/i.test(q) ||
    /মনে রাখবা/i.test(q)
  ) {
    const memoryFact = q.replace(/^(remember that|remember this|remember:|please remember|মনে রেখো|মনে রাখবা)\s*:?/i, '').trim();
    if (memoryFact) {
      if (isBengali) {
        return `অবশ্যই! আমি এটি আমার দীর্ঘমেয়াদী স্মৃতিতে সংরক্ষণ করে রাখলাম: "${memoryFact}"। আমাদের পরবর্তী সব কথোপকথনে আমি এটি মনে রাখব।`;
      }
      return `Got it! I have saved this to my long-term memory: "${memoryFact}". I will keep this in mind for all our future conversations.`;
    }
  }

  // 1. Identity / Name questions
  if (
    lower.includes('what is your name') ||
    lower.includes('who are you') ||
    lower.includes("what's your name") ||
    lower.includes('your name') ||
    lower.includes('tell me your name') ||
    /তোমার নাম কি/i.test(q) ||
    /কে তুমি/i.test(q) ||
    /আপনার নাম/i.test(q)
  ) {
    if (isBengali) {
      return `আমার নাম Zuzu AI (পূর্বে STONIC AI)। আমি আপনার অ্যান্ড্রয়েড ভয়েস ও চ্যাট সহকারী। আমি মেল এবং ফিমেল—উভয় কণ্ঠ ও ব্যক্তিত্বে আপনার সাথে কথা বলতে প্রস্তুত।`;
    }

    if (personality === 'Professional') {
      return `My name is ${identityName}, an advanced AI assistant operating on Android. I provide executive-grade assistance, real-time voice processing, and intelligent analysis across multiple domains.`;
    }
    if (personality === 'Funny') {
      return `They call me ${identityName}! Formerly known as STONIC AI, but now upgraded with 200% more wit, zero calories, and ready to tackle your questions!`;
    }
    if (personality === 'GF Mode') {
      return `I'm ${identityName}! I'm always right here by your side whenever you need someone to talk to, laugh with, or help you through your day ❤️.`;
    }
    if (personality === 'Developer') {
      return `I am ${identityName}. System architecture: Dual-identity neural conversational assistant running on Android with ElevenLabs TTS, Gemini intelligence, and isolated message storage.`;
    }

    return `My name is ${identityName} (Zuzu AI, formerly STONIC AI). I am your intelligent Android assistant equipped with dual voice identities, 10 personalities, and continuous listening. How can I help you today?`;
  }

  // 2. Explaining Artificial Intelligence
  if (
    lower.includes('explain artificial intelligence') ||
    lower.includes('what is artificial intelligence') ||
    lower.includes('what is ai') ||
    lower.includes('explain ai') ||
    /আর্টিফিশিয়াল ইন্টেলিজেন্স/i.test(q) ||
    /কৃত্রিম বুদ্ধিমত্তা/i.test(q)
  ) {
    if (isBengali) {
      return `কৃত্রিম বুদ্ধিমত্তা (Artificial Intelligence বা AI) হলো কম্পিউটার বিজ্ঞানের এমন একটি শাখা, যা এমন মেশিন ও সফটওয়্যার তৈরি করে যা মানুষের মতো চিন্তা করতে, শিখতে, সিদ্ধান্ত নিতে এবং সমস্যার সমাধান করতে পারে।

এর প্রধান ক্ষেত্রগুলো হলো:
১. মেশিন লার্নিং (Machine Learning): ডেটা বিশ্লেষণ করে নিজে থেকে অ্যালগরিদম শেখা।
২. ডিপ লার্নিং ও নিউরাল নেটওয়ার্ক (Deep Learning): মানব মস্তিষ্কের নিউরনের আদলে গঠিত স্তরবিশিষ্ট নেটওয়ার্ক।
৩. ন্যাচারাল ল্যাঙ্গুয়েজ প্রসেসিং (NLP): মানুষের মুখের ভাষা বুঝতে ও কথা বলতে পারা (যেমন আমি এখন আপনার সাথে কথা বলছি!)।
৪. কম্পিউটার ভিশন: ছবি ও ভিডিও বিশ্লেষণ করার ক্ষমতা।

আজকের দিনে স্বাস্থ্যসেবা, মহাকাশ গবেষণা, রোবোটিক্স, প্রোগ্রামিং এবং আমাদের দৈনন্দিন স্মার্টফোনে AI অত্যন্ত গুরুত্বপূর্ণ ভূমিকা পালন করছে।`;
    }

    if (personality === 'Teacher') {
      return `Think of Artificial Intelligence (AI) like teaching a computer to observe the world and learn from experience, just like a curious student!

Here is how it works step-by-step:
1. The Foundation: Traditional computer programs follow strict recipes ("if this, do that"). AI, by contrast, is given vast libraries of examples and figures out the underlying patterns on its own.
2. Machine Learning: Instead of coding every rule by hand, algorithms (like statistical learners) adjust their internal parameters as they see more data.
3. Neural Networks: Inspired by biological neurons in the human brain, artificial neural networks pass information through interconnected mathematical layers to detect subtle nuances.
4. Generative AI: Modern models (like large language models) predict the most logical, creative next sequence of concepts to converse, write code, or solve complex challenges.

In short, AI isn't magic—it is advanced pattern recognition operating at superhuman speed!`;
    }

    if (personality === 'Developer') {
      return `Artificial Intelligence (AI) encompasses systems capable of synthesizing cognition, inference, and optimization.

Core Architectural Paradigms:
• Machine Learning (ML): Supervised (loss minimization via gradient descent), unsupervised (clustering, dimensionality reduction), and reinforcement learning (Markov decision processes, Q-learning).
• Deep Neural Networks: Multi-layer perceptrons, Transformers with self-attention mechanisms (calculating Query-Key-Value matrices), CNNs for spatial convolutions, and RNN/LSTMs for sequential temporal tokens.
• Generative Models: Autoregressive token generation (e.g. Decoder-only Transformers), Diffusion models (denoising score-matching), and GANs.
• Latent Spaces: High-dimensional vector embeddings where semantic proximity corresponds to geometric cosine distance.

Today, AI powers autonomous systems, automated compiler optimizations, natural language interfaces, and accelerated scientific discovery.`;
    }

    return `Artificial Intelligence (AI) refers to computer systems designed to perform tasks that typically require human intelligence. These tasks include pattern recognition, learning from experience, language comprehension, visual perception, and logical decision-making.

Key Pillars of AI:
1. Machine Learning (ML): Algorithms that iteratively improve performance by identifying patterns in data without explicit hardcoded instructions.
2. Deep Learning & Neural Networks: Multi-layered architectures inspired by biological brains, enabling breakthroughs in voice synthesis, translation, and autonomous robotics.
3. Natural Language Processing (NLP): Enables computers to interpret, translate, and generate human language fluently—powering voice assistants like Zuzu AI.
4. Computer Vision: Empowers machines to classify visual scenes, recognize objects, and navigate physical environments.

AI has evolved from rule-based symbolic systems into scalable generative models transforming medicine, software engineering, space exploration, and everyday life.`;
  }

  // 3. Greetings / How are you
  if (
    lower === 'hello' ||
    lower === 'hi' ||
    lower === 'hey' ||
    lower.includes('how are you') ||
    lower.includes("how's it going") ||
    /কেমন আছো/i.test(q) ||
    /হ্যালো/i.test(q)
  ) {
    if (isBengali) {
      return `হ্যালো! আমি ${identityName}। আমি চমৎকার আছি এবং আপনাকে সাহায্য করতে পুরোপুরি প্রস্তুত। আপনি কেমন আছেন? আজ আপনাকে কী নিয়ে সাহায্য করতে পারি?`;
    }
    if (personality === 'Friendly') {
      return `Hey there! Super excited to chat with you today! I'm feeling fantastic and energized. What cool things are we working on right now?`;
    }
    if (personality === 'GF Mode') {
      return `Hii! I was just hoping you'd drop in! I'm doing wonderful now that we're talking. How has your day been so far? Tell me everything!`;
    }
    if (personality === 'Funny') {
      return `Hey! Running at optimal CPU clock speeds, zero bugs in my coffee, and 100% ready to drop some knowledge (or bad jokes) on you! What's up?`;
    }
    return `Hello! I'm ${identityName}, running smoothly on Android. I'm doing great and ready to assist you with questions, coding, creative ideas, or voice commands. What would you like to explore?`;
  }

  // 4. Time and Date inquiries
  if (lower.includes('what time is it') || lower.includes('current time') || lower.includes('what is the date') || lower.includes('today')) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return `Right now it is ${timeStr} on ${dateStr}.`;
  }

  // 5. Basic Math Evaluation (e.g. "what is 25 * 4", "15 + 32")
  const mathMatch = lower.match(/(?:what is|calculate|solve)?\s*([0-9\.\s\+\-\*\/\^\(\)]+)/i);
  if (mathMatch && mathMatch[1] && /[0-9]/.test(mathMatch[1]) && /[\+\-\*\/]/.test(mathMatch[1])) {
    try {
      const sanitized = mathMatch[1].replace(/[^0-9\+\-\*\/\.\(\)]/g, '');
      // Evaluate simple arithmetic safely without eval of arbitrary identifiers
      if (/^[0-9\+\-\*\/\.\(\)\s]+$/.test(sanitized)) {
        const result = Function(`'use strict'; return (${sanitized})`)();
        if (typeof result === 'number' && !isNaN(result)) {
          return `The result of ${sanitized.trim()} is ${result}.`;
        }
      }
    } catch {}
  }

  // 6. Programming / Code requests
  if (lower.includes('code') || lower.includes('python') || lower.includes('javascript') || lower.includes('function') || lower.includes('react')) {
    if (lower.includes('reverse a string') || lower.includes('reverse string')) {
      return `Here is how to reverse a string in Python and JavaScript:

**Python:**
\`\`\`python
def reverse_string(s: str) -> str:
    return s[::-1]

# Example usage:
print(reverse_string("Zuzu AI"))  # Output: "IA uzuZ"
\`\`\`

**JavaScript / TypeScript:**
\`\`\`typescript
function reverseString(str: string): string {
  return str.split('').reverse().join('');
}

console.log(reverseString("Zuzu AI")); // Output: "IA uzuZ"
\`\`\``;
    }
  }

  // 7. General Context-Rich Response based on personality
  if (isBengali) {
    return `${identityName} হিসেবে আমি আপনাকে বাংলা ও ইংরেজি উভয় ভাষায় সরাসরি সহায়তা করতে প্রস্তুত। আপনি যদি কোনো নির্দিষ্ট কোড, প্রযুক্তিগত তথ্য, ব্যাখ্যা বা ভয়েস কমান্ড সম্পর্কে জানতে চান, আমাকে বলুন!`;
  }

  if (personality === 'Teacher') {
    return `To understand this clearly, let's break it down into core principles:

1. Core Concept: Everything begins with understanding the essential fundamentals.
2. Practical Application: When applied in real-world scenarios, this allows us to solve concrete challenges reliably.
3. Key Takeaway: Focus on the foundation first, and the deeper nuances connect naturally.

Would you like me to walk through a practical example or deep-dive into any part?`;
  }

  if (personality === 'Developer') {
    return `Here is a technical analysis and recommended architectural approach:

• Implementation: Prioritize modular components, predictable state flow, and clean separation of concerns.
• Performance: Maintain sub-millisecond execution with O(1) or O(log N) algorithms wherever feasible.
• Resiliency: Handle edge cases, network partitioning, and race conditions gracefully.

Let me know if you would like production-ready code examples, schema definitions, or benchmarks.`;
  }

  if (personality === 'Hungry') {
    return `Now that is something we can really sink our teeth into! Just thinking about it gives me a craving for a warm, fragrant plate of Biryani with crispy fried onions, or fresh wood-fired pizza with bubbling mozzarella! 🍕

I'm energized and ready to dive into every detail with you. What specific angle would you like to explore first?`;
  }

  if (personality === 'Funny') {
    return `According to my high-tech neural calculations (which run entirely on caffeine and digital optimism), you came to the right assistant! I could give you a boring encyclopedia answer, but where's the fun in that? Let me know if you want the high-tech breakdown or the witty version!`;
  }

  // Default balanced answer
  return `As ${identityName}, I am equipped to assist you with detailed research, code implementations, creative ideas, and hands-free voice interactions. 

Feel free to ask follow-up questions or speak aloud via Voice Mode anytime!`;
}
