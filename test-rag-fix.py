#!/usr/bin/env python3
"""
Test script to verify the RAG system is working properly.
Run this after starting the AI service to test document retrieval.
"""

import requests
import json

# AI service URL
AI_SERVICE_URL = "http://localhost:8000"

def test_rag_system():
    # Test space ID (replace with a real one from your database)
    test_space_id = "test-space-id"

    print("Testing RAG system...")
    print(f"AI Service URL: {AI_SERVICE_URL}")

    # Test 1: Create a test embedding
    print("\n1. Creating test embedding...")
    embed_payload = {
        "space_id": test_space_id,
        "text": "Our delicious pizza menu includes Margherita for $12, Pepperoni for $14, and Hawaiian for $16. All pizzas are made with fresh ingredients.",
        "item_id": None
    }

    try:
        response = requests.post(f"{AI_SERVICE_URL}/embed", json=embed_payload)
        if response.status_code == 200:
            print("✅ Embedding created successfully")
        else:
            print(f"❌ Failed to create embedding: {response.status_code} - {response.text}")
            return
    except Exception as e:
        print(f"❌ Error creating embedding: {e}")
        return

    # Test 2: Query the RAG system
    print("\n2. Testing RAG query...")
    rag_payload = {
        "space_id": test_space_id,
        "query": "what does the menu include?",
        "k": 3,
        "context": {
            "space": {
                "name": "Test Pizza Place",
                "description": "A local pizza restaurant",
                "category": "restaurant"
            },
            "profile": {
                "businessName": "Test Pizza Place"
            },
            "items": [],
            "availableActions": ["order", "contact"]
        }
    }

    try:
        response = requests.post(f"{AI_SERVICE_URL}/rag/query", json=rag_payload)
        if response.status_code == 200:
            data = response.json()
            print("✅ RAG query successful")
            print(f"Answer: {data.get('answer', 'No answer')}")
            print(f"Retrieved contexts: {data.get('retrieved_count', 0)}")
            print(f"Citations: {len(data.get('citations', []))}")

            # Check if the response mentions menu items
            answer = data.get('answer', '').lower()
            if any(item in answer for item in ['pizza', 'margherita', 'pepperoni', 'hawaiian', '$12', '$14', '$16']):
                print("✅ RAG successfully retrieved document content!")
            else:
                print("⚠️  RAG response doesn't seem to use document content")
                print("This might indicate the retrieval isn't working properly")
        else:
            print(f"❌ RAG query failed: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"❌ Error querying RAG: {e}")

if __name__ == "__main__":
    test_rag_system()