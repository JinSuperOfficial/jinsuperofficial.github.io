import os
import json
import time
import requests

# ==================== 配置区 ====================
# 在这里修改每天要推送的作业内容
HOMEWORK_TITLE = "今日高数"
HOMEWORK_CONTENT = "完成习题 5.1，明天上课交。"
# ================================================

# 从 GitHub Secrets 中读取敏感配置
APPID = os.environ.get("WX_APPID")
SECRET = os.environ.get("WX_SECRET")
TEMPLATE_ID = os.environ.get("WX_TEMPLATE_ID")

def main():
    # 1. 检查环境变量
    if not all([APPID, SECRET, TEMPLATE_ID]):
        print("❌ 环境变量缺失，请检查 GitHub Secrets 配置。")
        return

    # 2. 读取 students.json
    try:
        # 获取脚本所在目录，确保路径正确
        base_dir = os.path.dirname(os.path.abspath(__file__))
        json_path = os.path.join(base_dir, "students.json")
        
        with open(json_path, "r", encoding="utf-8") as f:
            students = json.load(f)
            
        if not students:
            print("❌ students.json 为空，没有需要推送的同学。")
            return
            
        print(f"✅ 成功读取名单，共 {len(students)} 位同学。")
        
    except Exception as e:
        print(f"❌ 读取 students.json 失败: {e}")
        return

    # 3. 获取 access_token (只需获取一次)
    print("正在获取 access_token...")
    token_url = f"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid={APPID}&secret={SECRET}"
    token_res = requests.get(token_url).json()
    access_token = token_res.get("access_token")
    
    if not access_token:
        print("❌ 获取 access_token 失败:", token_res)
        return
    print("✅ access_token 获取成功。")

    # 4. 遍历同学名单，逐个推送
    send_url = f"https://api.weixin.qq.com/cgi-bin/message/template/send?access_token={access_token}"
    
    for index, student in enumerate(students):
        name = student.get("name", "未知")
        userid = student.get("userid")
        
        if not userid:
            print(f"⚠️ 跳过第 {index+1} 位同学：未配置 userid")
            continue

        data = {
            "touser": userid,
            "template_id": TEMPLATE_ID,
            "data": {
                "title": {"value": HOMEWORK_TITLE},
                "content": {"value": HOMEWORK_CONTENT}
            }
        }
        
        res = requests.post(send_url, json=data).json()
        
        if res.get("errcode") == 0:
            print(f"✅ [{index+1}/{len(students)}] 推送给 {name} 成功")
        else:
            print(f"❌ [{index+1}/{len(students)}] 推送给 {name} 失败: {res}")
        
        # 每次发送间隔 1.5 秒，防止触发微信接口频率限制
        time.sleep(1.5)

if __name__ == "__main__":
    main()
