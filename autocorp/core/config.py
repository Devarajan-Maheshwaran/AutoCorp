import os
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__),
                                      "../../.env"))

DEMO_MODE   = os.getenv("DEMO_MODE", "false").lower() == "true"
MOCK_URL    = os.getenv("MOCK_API_URL", "http://localhost:3001")
GEMINI_KEY  = os.getenv("GEMINI_API_KEY", "")
SEPOLIA_RPC = os.getenv("SEPOLIA_RPC_URL", "https://rpc.sepolia.org")
PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")
FACTORY_ADDR    = os.getenv("FACTORY_CONTRACT_ADDRESS", "")
BUSINESS_ADDR   = os.getenv("BUSINESS_CONTRACT_ADDRESS", "")
USDC_ADDR       = os.getenv("USDC_CONTRACT_ADDRESS", "")

# Agent URLs
PROCUREMENT_URL = os.getenv("PROCUREMENT_URL", "http://localhost:8003")
SALES_URL       = os.getenv("SALES_URL",       "http://localhost:8004")
LOGISTICS_URL   = os.getenv("LOGISTICS_URL",   "http://localhost:3002")
ACCOUNTANT_URL  = os.getenv("ACCOUNTANT_URL",  "http://localhost:8006")
FOUNDER_URL     = os.getenv("MASTERAGENT_URL", "http://localhost:8787")
