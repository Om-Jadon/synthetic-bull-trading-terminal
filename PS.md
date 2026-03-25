# NEXTBULL X IIT Kharagpur  
**Open Soft Competition | 2026**

## Title  
**Project Synthetic-Bull: Full-Stack Exchange Simulator & Algorithmic Trading Terminal**

---

## Background & Objective

At NextBull, before we deploy any new trading interface or execution algorithm into live markets, we test them in highly controlled, simulated environments. We are challenging the tech innovators at IIT Kharagpur to build **Project Synthetic-Bull**, a completely self-contained, real-time simulated cryptocurrency/stock exchange with an integrated web trading terminal and automated quantitative trading bots.

This project sits at the intersection of high-throughput backend engineering, real-time frontend visualization, and algorithmic trading. No external datasets will be provided. Your system must generate its own synthetic market activity, maintain a live order book, and allow both human and AI users to trade against it.

---

## Technical Requirements & Specifications

### Module 1: The Core Matching Engine & Market Simulator (Backend / Systems)

- **The Matching Engine:**  
  Build an in-memory Limit Order Book (LOB) that supports three strict message types:
  - Limit Order  
  - Market Order  
  - Cancel Order  

  It must execute trades using strict **Price-Time priority**.

- **The Synthetic Market Generator:**  
  Since no external data is provided, you must build a background process that acts as the "Market."

  This process will continuously generate a baseline asset price using a **Geometric Brownian Motion (GBM) model**:

  ```
  St = S0 exp((μ - σ²/2)t + σWt)
  ```

  Based on this moving baseline price, the generator must continuously submit a flurry of randomized Limit Bids and Asks to populate the order book and simulate real market liquidity.

---

### Module 2: The NextBull Web Terminal (Frontend / SDE)

- **Real-Time Data Streaming:**
  The backend must broadcast order book updates and trade executions to the frontend using **WebSockets**.

- **The Dashboard:**
  Build a modern, NextBull-styled web interface featuring:

  - A live, auto-updating **Candlestick chart** (1-second or 5-second intervals)
  - A visual representation of the **Limit Order Book (Bid/Ask depth)**
  - A control panel for a "Human User" to manually submit Market and Limit orders
  - A real-time **Portfolio widget** showing:
    - Current cash balance
    - Asset holdings
    - Live P&L (Profit and Loss)

---

### Module 3: The Quantitative Trading Bots (Quant / ML)

**Note:** This part is optional and will be used to eliminate ties.

Design and integrate two distinct automated trading bots that connect to your exchange via WebSockets or local API and trade with simulated capital:

- **The Market Maker Bot:**
  - Continuously provides liquidity
  - Places Limit Bids slightly below mid-price
  - Places Limit Asks slightly above mid-price
  - Attempts to profit from the spread while managing inventory risk

- **The Alpha Bot:**
  - A directional trading bot
  - Ingests live data stream
  - Uses statistical or ML approaches (e.g.):
    - Moving Average Crossover
    - RSI
    - Lightweight predictive models
  - Executes Market Orders when it detects a trend

---

## Constraints & System Rules

1. **Zero External Dependencies for Data:**
   - The system must not rely on live APIs (like Binance or Yahoo Finance) or external CSV files.
   - The market simulation must be generated 100% locally by your code upon startup.

2. **Latency & Scale:**
   - Your synthetic market generator should push at least **50–100 order messages per second** to test:
     - WebSocket streaming capability
     - Frontend rendering performance

3. **Capital Rules:**
   - All users and bots start with **$100,000 simulated capital**
   - **Short selling is permitted**

---

## Submission Instructions & Deliverables

1. **Source Code:**
   - Fully containerized
   - A single command:
     ```
     docker-compose up
     ```
     must launch:
     - Backend engine
     - Market generator
     - Trading bots (optional)
     - Frontend terminal

2. **Architecture & Quant Report (Max 10 pages):**
   - System architecture diagram mapping data flow from Matching Engine to Frontend
   - Mathematical logic/parameters used for:
     - Synthetic Market Generator
     - Trading Bots *(optional)*

3. **Presentation (Max 15 slides):**
   - Explaining the solution
   - Weightage: **10%**

---

## Evaluation Criteria (100 Points Total)

- **Backend & Architecture (20%)**
  - Matching engine accuracy
  - WebSocket stability
  - Ability to handle high message throughput

- **Frontend & UX (50%)**
  - Responsiveness of web terminal
  - Charting quality
  - UI/UX design

- **Quant & Bot Logic (5% Bonus)**
  - Realism of synthetic market generator
  - Soundness/profitability of trading bots

- **Code Quality & Deployment (20%)**
  - Clean, modular code
  - Proper Dockerization
  - Seamless one-click execution