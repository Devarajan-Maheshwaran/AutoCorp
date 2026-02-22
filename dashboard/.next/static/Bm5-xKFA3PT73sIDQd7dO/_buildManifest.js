self.__BUILD_MANIFEST = {
  "__rewrites": {
    "afterFiles": [
      {
        "source": "/masteragent/:path*"
      },
      {
        "source": "/agent8002/:path*"
      },
      {
        "source": "/agent8003/:path*"
      },
      {
        "source": "/agent8004/:path*"
      },
      {
        "source": "/agent3002/:path*"
      },
      {
        "source": "/agent8006/:path*"
      },
      {
        "source": "/chartgen/:path*"
      },
      {
        "source": "/api/:path*"
      }
    ],
    "beforeFiles": [],
    "fallback": []
  },
  "sortedPages": [
    "/_app",
    "/_error"
  ]
};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()