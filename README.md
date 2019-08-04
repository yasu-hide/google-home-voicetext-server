# google-home-voicetext-server
[sikkimtemiさん](https://github.com/sikkimtemi)の[google-home-voicetext](https://github.com/sikkimtemi/google-home-voicetext)のAPIサーバ、ファイルサーバの再実装です。

Google Homeに任意の音声を喋らせる仕組みです。

Dockerで動作させる前提で、マルチキャストDNS(mdns)を使わない作りにしました。

クラウドプッシュ連携はサーバと分離しました。
- Firebase(Firestore) https://github.com/yasu-hide/google-home-voicetext-firebase
- Beebotte(MQTT) https://github.com/yasu-hide/google-home-voicetext-mqtt

## 変更1. mdnsを諦めた
Google Homeはmdns(Bonjour,dns-sd)によるZeroconfに対応しています。

Docker標準のネットワーク(docker0)はiptablesでNATしていてマルチキャストパケットを通しません。

Docker環境では自動探索機能が利用できず、期待した動作をしないため廃止しました。

macvlanなどマルチキャストが使えるネットワークで利用される場合でも自動探索は行いません。

## 変更2. 任意のGoogle HomeをURLで指定可能にした
URLで指定したIPアドレスのGoogle Homeを喋らせられます。

複数のGoogle Homeを使い分けている場合に便利です。

```
curl -X POST -d "text=喋らせる言葉" http://(サーバIPアドレス)/(Google Home IPアドレス)
```

指定されたGoogle HomeのIPアドレスの分だけ音声ファイルが生成されるためディスク使用量には注意が必要です。

## 変更3. 音声ファイルを圧縮フォーマットに変更した
音声ファイルの形式を、Voicetext、Google Homeともに対応しているOgg Vorbis(.ogg)に変更しました。

任意のGoogle Homeを指定可能にした都合です。

# URLで指定できる項目 (FORM VALUE)
実行例
```
curl -X POST http://192.168.20.140:8080/192.168.20.200 \
  -d "text=おバブやかましい" \
  -d "speaker=bear" \
  -d "emotion=anger" \
  -d "emotion_level=extreme"
```
## text (必須)
喋らせたい内容です。

指定をしないとエラーが発生します。

## speaker (任意)
話者を指定できます。

設定できる項目は、[VoiceTextのAPIマニュアル](https://cloud.voicetext.jp/webapi/docs/api)のパラメータを参照してください。

## emotion (任意)
話者の感情を指定できます。

設定できる項目は、[VoiceTextのAPIマニュアル](https://cloud.voicetext.jp/webapi/docs/api)のパラメータを参照してください。

## emotion_level (任意)
話者の感情レベルを指定できます。


# 起動時に設定できる項目 (環境変数)
## VOICETEXT_API_KEY (必須)
HOYA VoiceTextのAPIキーです。

以下のページで無料利用登録を行ってAPIキーを取得して設定してください。

https://cloud.voicetext.jp/webapi

```
export VOICETEXT_API_KEY={取得したAPIキー}
```

## LISTEN_ADDRESS または LISTEN_INTERFACE (いずれか必須)
サーバが起動するIPアドレスです。

Google HomeがアクセスできるURLを生成するため、動作しているサーバのIPアドレスが必要です。

`LISTEN_ADDRESS`にGoogle HomeからアクセスできるIPアドレスを指定してください。

```
export LISTEN_ADDRESS=192.168.20.140
```

IPアドレスが変動する環境で利用する場合は`LISTEN_INTERFACE`に通信モジュール名を指定してください。

```
export LISTEN_INTERFACE=en0
```

## LISTEN_PORT (任意)
サーバが起動するポート番号です。

デフォルトは __8080__ です。

```
export LISTEN_PORT=80
```

## VOICETEXT_SPEAKER (任意)
話者を指定できます。

デフォルトの話者は`HIKARI`という女性です。

設定できる項目は、[VoiceTextのAPIマニュアル](https://cloud.voicetext.jp/webapi/docs/api)のパラメータを参照してください。

```
export VOICETEXT_SPEAKER=BEAR
```

## VOICETEXT_EMOTION (任意)
話者の感情を指定できます。

デフォルトの感情は`HAPPINESS`です。

設定できる項目は、[VoiceTextのAPIマニュアル](https://cloud.voicetext.jp/webapi/docs/api)のパラメータを参照してください。

## VOICETEXT_EMOTION_LEVEL (任意)
話者の感情レベルを指定できます。

デフォルトの感情レベルは`NORMAL`です。

| 感情レベル | VoiceTextの値 |
| --- | --- |
| `1` または `NORMAL` | 1 |
| `2` または `HIGH`   | 2 |
| `3` または `SUPER`  | 3 |
| `4` または `EXTREME` | 4 |

## VOICETEXT_VOLUME (任意)
音量を数値で指定できます。

設定できる項目は、[VoiceTextのAPIマニュアル](https://cloud.voicetext.jp/webapi/docs/api)のパラメータを参照してください。
