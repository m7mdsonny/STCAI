"""Run STC Solutions AI Edge Server. 14-day trial, no license required. UI + API + detectors."""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )
