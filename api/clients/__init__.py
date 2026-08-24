"""Unify Adalflow compatible clients to here.
Any patches and additional clients could be applied or imported in this module.
"""

from adalflow.components.model_client import (
    AzureAIClient,
    GoogleGenAIClient,
)

from .openai import OpenAIClient

from .anthropic import AnthropicBedrockClient
from .bedrock import BedrockClient
from .dashscope import DashscopeClient
from .google_embedder import GoogleEmbedderClient
from .litellm import LiteLLMClient
from .local_embedder import LocalEmbedderClient
from .ollama import OllamaClient
from .openrouter import OpenRouterClient

__all__ = [
    "AnthropicBedrockClient",
    "AzureAIClient",
    "BedrockClient",
    "DashscopeClient",
    "GoogleEmbedderClient",
    "GoogleGenAIClient",
    "LiteLLMClient",
    "LocalEmbedderClient",
    "OllamaClient",
    "OpenAIClient",
    "OpenRouterClient",
]
