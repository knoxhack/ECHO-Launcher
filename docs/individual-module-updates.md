# Individual Module Updates

Individual module updates are driven by the pack manifest's `moduleRequirements` array.

## Manifest Shape

```json
{
  "moduleArtifactFamily": "neoforge",
  "moduleRequirements": [
    {
      "id": "echoashfallprotocol",
      "version": "1.0.0",
      "required": true
    }
  ]
}
```

The launcher derives the default artifact name from the family:

| Family | Default artifact |
| --- | --- |
| `echo-addon` | `<module>-<version>.echo-addon` |
| `neoforge` | `<module>-<version>-neoforge.jar` |
| `standalone` | `<module>-<version>-standalone.jar` |

Each requirement may override `assetName`, `path`, `sha256`, `size`, `required`, `side`, or `artifactFamily` when the default is not enough.
